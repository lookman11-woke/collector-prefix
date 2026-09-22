package collector

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	protoproducer "github.com/netsampler/goflow2/v2/producer/proto"
	gfutils "github.com/netsampler/goflow2/v2/utils"

	"github.com/collector-prefix/backend/internal/clickhouse"
	"github.com/collector-prefix/backend/internal/config"
	"github.com/collector-prefix/backend/internal/enricher"
)

// Stats exposes runtime counters for the /api/v1/status endpoint.
type Stats struct {
	FlowsReceived  atomic.Uint64
	FlowsInserted  atomic.Uint64
	BatchesSent    atomic.Uint64
	InsertErrors   atomic.Uint64
	LastInsertTime atomic.Int64
}

// Collector orchestrates flow ingestion and enrichment.
type Collector struct {
	cfg     *config.Config
	enc     *enricher.Enricher
	ch      *clickhouse.Client
	stats   *Stats
	buf     []clickhouse.FlowRow
	bufMu   sync.Mutex
	flushCh chan struct{}
}

// New creates a Collector ready to start.
func New(cfg *config.Config, enc *enricher.Enricher, ch *clickhouse.Client, stats *Stats) *Collector {
	return &Collector{
		cfg:     cfg,
		enc:     enc,
		ch:      ch,
		stats:   stats,
		buf:     make([]clickhouse.FlowRow, 0, cfg.Collector.BatchSize),
		flushCh: make(chan struct{}, 1),
	}
}

// Run starts the UDP listener and batch flusher, blocking until ctx is cancelled.
func (c *Collector) Run(ctx context.Context) error {
	host, portStr, err := net.SplitHostPort(c.cfg.Collector.ListenAddr)
	if err != nil {
		return fmt.Errorf("collector: parse listen addr: %w", err)
	}
	port := 0
	fmt.Sscanf(portStr, "%d", &port)

	slog.Info("collector: starting",
		"addr", c.cfg.Collector.ListenAddr,
		"sampling_rate", c.cfg.Collector.SamplingRate,
		"batch_size", c.cfg.Collector.BatchSize,
		"asns", len(c.cfg.ASNs),
	)

	flushInterval := time.Duration(c.cfg.Collector.BatchMaxWait) * time.Millisecond
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.triggerFlush()
			case <-c.flushCh:
				c.doFlush(ctx)
			}
		}
	}()

	prodCfg := &protoproducer.ProducerConfig{}
	compiledCfg, err := prodCfg.Compile()
	if err != nil {
		return fmt.Errorf("collector: compile producer config: %w", err)
	}
	prod, err := protoproducer.CreateProtoProducer(compiledCfg, protoproducer.CreateSamplingSystem)
	if err != nil {
		return fmt.Errorf("collector: create producer: %w", err)
	}

	flowFmt := &flowFormat{c: c}
	pipe := gfutils.NewNetFlowPipe(&gfutils.PipeConfig{
		Producer: prod,
		Format:   flowFmt,
	})

	recv, err := gfutils.NewUDPReceiver(&gfutils.UDPReceiverConfig{
		Workers:   4,
		Sockets:   1,
		QueueSize: 1_000_000,
	})
	if err != nil {
		return fmt.Errorf("collector: udp receiver: %w", err)
	}

	if err := recv.Start(host, port, pipe.DecodeFlow); err != nil {
		return fmt.Errorf("collector: start receiver: %w", err)
	}
	slog.Info("collector: listening", "addr", c.cfg.Collector.ListenAddr)

	<-ctx.Done()
	if err := recv.Stop(); err != nil {
		slog.Warn("collector: stop receiver", "err", err)
	}
	c.doFlush(context.Background())
	slog.Info("collector: stopped")
	return nil
}

// enrichAndQueue converts a goflow2 ProtoProducerMessage into a FlowRow,
// tagging it with the matched ISP prefix and owning ASN, then queues it.
func (c *Collector) enrichAndQueue(msg *protoproducer.ProtoProducerMessage) {
	c.stats.FlowsReceived.Add(1)

	rate := uint64(c.cfg.Collector.SamplingRate)

	// Normalise src/dst to 4-byte IPv4 net.IP (what clickhouse-go IPv4 expects)
	srcNetIP := toIP4(msg.SrcAddr)
	dstNetIP := toIP4(msg.DstAddr)

	srcASN := c.enc.LookupASN(srcNetIP)
	dstASN := c.enc.LookupASN(dstNetIP)

	routerIP := ""
	if len(msg.SamplerAddress) > 0 {
		routerIP = net.IP(msg.SamplerAddress).String()
	}

	inIface := msg.InIf
	outIface := msg.OutIf

	inInfo, hasIn := c.enc.LookupInterface(routerIP, inIface)
	outInfo, hasOut := c.enc.LookupInterface(routerIP, outIface)

	dstPfx, dstMatched := c.enc.MatchPrefix(dstNetIP)
	srcPfx, srcMatched := c.enc.MatchPrefix(srcNetIP)

	if !dstMatched && !srcMatched {
		return // not our traffic
	}

	var ispPrefix, ispASN string
	var isInbound uint8
	var ifName string

	if hasIn && !hasOut {
		// Flow entered through a monitored edge interface -> INBOUND
		isInbound = 1
		ifName = inInfo.Name
		if dstMatched {
			ispPrefix = dstPfx.CIDR
			ispASN = dstPfx.ISPASN
		} else {
			ispPrefix = srcPfx.CIDR
			ispASN = srcPfx.ISPASN
		}
	} else if !hasIn && hasOut {
		// Flow exited through a monitored edge interface -> OUTBOUND
		isInbound = 0
		ifName = outInfo.Name
		if srcMatched {
			ispPrefix = srcPfx.CIDR
			ispASN = srcPfx.ISPASN
		} else {
			ispPrefix = dstPfx.CIDR
			ispASN = dstPfx.ISPASN
		}
	} else if hasIn && hasOut {
		// Flow crossed two monitored interfaces
		if dstMatched {
			isInbound = 1
			ifName = inInfo.Name
			ispPrefix = dstPfx.CIDR
			ispASN = dstPfx.ISPASN
		} else {
			isInbound = 0
			ifName = outInfo.Name
			ispPrefix = srcPfx.CIDR
			ispASN = srcPfx.ISPASN
		}
	} else {
		// Neither interface is in config
		if dstMatched {
			isInbound = 1
			ispPrefix = dstPfx.CIDR
			ispASN = dstPfx.ISPASN
		} else {
			isInbound = 0
			ispPrefix = srcPfx.CIDR
			ispASN = srcPfx.ISPASN
		}
	}

	row := clickhouse.FlowRow{
		Timestamp:     time.Now().UTC(),
		RouterID:      routerIP,
		InIface:       inIface,
		OutIface:      outIface,
		InterfaceName: ifName,
		SrcIP:         srcNetIP,
		DstIP:         dstNetIP,
		SrcASN:        srcASN,
		DstASN:        dstASN,
		Proto:         uint8(msg.Proto),
		Bytes:         msg.Bytes * rate,
		Packets:       msg.Packets * rate,
		IsInbound:     isInbound,
		ISPPrefix:     ispPrefix,
		ISPASN:        ispASN,
	}

	c.bufMu.Lock()
	if len(c.buf) >= 100000 {
		c.bufMu.Unlock()
		slog.Warn("collector: buffer full (100k flows), dropping flow to prevent OOM")
		return
	}
	c.buf = append(c.buf, row)
	full := len(c.buf) >= c.cfg.Collector.BatchSize
	c.bufMu.Unlock()
	if full {
		c.triggerFlush()
	}
}

func (c *Collector) triggerFlush() {
	select {
	case c.flushCh <- struct{}{}:
	default:
	}
}

func (c *Collector) doFlush(ctx context.Context) {
	c.bufMu.Lock()
	if len(c.buf) == 0 {
		c.bufMu.Unlock()
		return
	}
	rows := c.buf
	c.buf = make([]clickhouse.FlowRow, 0, c.cfg.Collector.BatchSize)
	c.bufMu.Unlock()

	if err := c.ch.InsertFlows(ctx, rows); err != nil {
		slog.Error("collector: insert error", "rows", len(rows), "err", err)
		c.stats.InsertErrors.Add(1)
		return
	}
	c.stats.FlowsInserted.Add(uint64(len(rows)))
	c.stats.BatchesSent.Add(1)
	c.stats.LastInsertTime.Store(time.Now().UnixNano())
	slog.Debug("collector: flushed", "rows", len(rows))
}

// flowFormat implements goflow2's format.FormatInterface.
type flowFormat struct {
	c *Collector
}

func (f *flowFormat) Format(data interface{}) ([]byte, []byte, error) {
	pm, ok := data.(*protoproducer.ProtoProducerMessage)
	if !ok {
		return nil, nil, nil
	}
	f.c.enrichAndQueue(pm)
	return nil, nil, nil
}

// toIP4 converts a raw byte slice into a 4-byte IPv4 net.IP suitable for ClickHouse.
// Handles 4-byte IPv4, 16-byte IPv4-mapped IPv6 (::ffff:x.x.x.x), and returns IPv4zero for native IPv6.
func toIP4(src []byte) net.IP {
	if len(src) == 0 {
		return net.IPv4zero.To4()
	}
	ip := net.IP(src)
	if ip4 := ip.To4(); ip4 != nil {
		return ip4
	}
	return net.IPv4zero.To4()
}

func extractIP(key []byte) string {
	s := string(key)
	if idx := strings.LastIndex(s, ":"); idx != -1 {
		return strings.Trim(s[:idx], "[]")
	}
	return s
}

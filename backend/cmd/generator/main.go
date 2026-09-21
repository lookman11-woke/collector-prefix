package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"math/rand"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/collector-prefix/backend/internal/clickhouse"
	"github.com/collector-prefix/backend/internal/config"
	"github.com/collector-prefix/backend/internal/enricher"
)

func main() {
	cfgPath := flag.String("config", "config.yaml", "path to config.yaml")
	rate := flag.Int("rate", 200, "rows per second to generate")
	flag.Parse()

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		slog.Error("load config", "err", err)
		os.Exit(1)
	}

	ch, err := clickhouse.New(&cfg.ClickHouse)
	if err != nil {
		slog.Error("clickhouse connect", "err", err)
		os.Exit(1)
	}
	defer ch.Close()

	enc, err := enricher.New(cfg)
	if err != nil {
		slog.Error("enricher init", "err", err)
		os.Exit(1)
	}
	defer enc.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Build per-ASN prefix lists from config for realistic tagging
	type asnPrefixes struct {
		asn      string
		prefixes []string
	}
	var asnPfxList []asnPrefixes
	for _, a := range cfg.ASNs {
		var pfxs []string
		var walk func(ps []config.PrefixConfig)
		walk = func(ps []config.PrefixConfig) {
			for _, p := range ps {
				pfxs = append(pfxs, p.CIDR)
				walk(p.Children)
			}
		}
		walk(a.Prefixes)
		if len(pfxs) > 0 {
			asnPfxList = append(asnPfxList, asnPrefixes{asn: a.ASN, prefixes: pfxs})
		}
	}

	ifaces := enc.AllInterfaces()

	// External ASNs simulating internet sources
	externalASNs := []uint32{15169, 16509, 20940, 13335, 4826, 714, 32934, 2518, 9299, 4134}

	slog.Info("generator: injecting synthetic traffic", "rate_fps", *rate, "asns", len(asnPfxList))

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("generator: stopped")
			return
		case <-ticker.C:
			var rows []clickhouse.FlowRow
			now := time.Now().UTC()

			for i := 0; i < *rate; i++ {
				// Pick a random local ASN
				ap := asnPfxList[rand.Intn(len(asnPfxList))]
				prefix := ap.prefixes[rand.Intn(len(ap.prefixes))]

				isInbound := uint8(rand.Intn(2))
				extASN := externalASNs[rand.Intn(len(externalASNs))]

				// Scale bytes per ASN roughly proportional to index (more realistic spread)
				bytes := uint64(200_000 + rand.Intn(4_000_000))
				packets := bytes / 1400

				var srcASN, dstASN uint32
				if isInbound == 1 {
					srcASN = extASN
					dstASN = 0
				} else {
					srcASN = 0
					dstASN = extASN
				}

				iface := ifaces[rand.Intn(len(ifaces))]

				rows = append(rows, clickhouse.FlowRow{
					Timestamp:     now,
					RouterID:      iface.RouterIP,
					InIface:       iface.IfIndex,
					OutIface:      iface.IfIndex,
					InterfaceName: iface.Name,
					SrcIP:         net.IPv4(103, byte(rand.Intn(255)), byte(rand.Intn(255)), byte(rand.Intn(255))).To4(),
					DstIP:         net.IPv4(111, byte(rand.Intn(255)), byte(rand.Intn(255)), byte(rand.Intn(255))).To4(),
					SrcASN:        srcASN,
					DstASN:        dstASN,
					Proto:         6,
					Bytes:         bytes,
					Packets:       packets,
					IsInbound:     isInbound,
					ISPPrefix:     prefix,
					ISPASN:        ap.asn,
				})
			}

			if err := ch.InsertFlows(ctx, rows); err != nil {
				slog.Error("generator insert error", "err", err)
			} else {
				fmt.Printf("\rInserted %d rows @ %s  (ASNs: %d)", len(rows), now.Format("15:04:05"), len(asnPfxList))
			}
		}
	}
}

var _ = net.IPv4zero

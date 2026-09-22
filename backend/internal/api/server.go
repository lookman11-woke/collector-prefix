package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/collector-prefix/backend/internal/clickhouse"
	"github.com/collector-prefix/backend/internal/config"
	"github.com/collector-prefix/backend/internal/enricher"
)

// IngestStats is shared counter set updated by the collector.
type IngestStats struct {
	FlowsReceived  *atomic.Uint64
	FlowsInserted  *atomic.Uint64
	BatchesSent    *atomic.Uint64
	InsertErrors   *atomic.Uint64
	LastInsertTime *atomic.Int64
	StartTime      time.Time
}

// Server holds all dependencies for the HTTP API.
type Server struct {
	cfg     *config.Config
	ch      *clickhouse.Client
	enc     *enricher.Enricher
	stats   *IngestStats
	mux     *http.ServeMux
	handler http.Handler
}

// corsMiddleware wraps an http.Handler to supply CORS headers and handle OPTIONS preflight.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// New creates and registers all API routes.
func New(cfg *config.Config, ch *clickhouse.Client, enc *enricher.Enricher, stats *IngestStats) *Server {
	s := &Server{cfg: cfg, ch: ch, enc: enc, stats: stats, mux: http.NewServeMux()}
	s.routes()
	s.handler = corsMiddleware(s.mux)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.handler != nil {
		s.handler.ServeHTTP(w, r)
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/v1/status", s.handleStatus)
	s.mux.HandleFunc("GET /api/v1/asns", s.handleASNs)
	s.mux.HandleFunc("GET /api/v1/prefixes/tree", s.handlePrefixTree)
	s.mux.HandleFunc("GET /api/v1/interfaces", s.handleInterfaces)
	s.mux.HandleFunc("POST /api/v1/traffic/overview", s.handleTrafficOverview)
	s.mux.HandleFunc("POST /api/v1/traffic/asn-flow", s.handleAsnFlow)
	s.mux.HandleFunc("POST /api/v1/traffic/asn-detail", s.handleAsnDetail)
	s.mux.HandleFunc("POST /api/v1/reports/interfaces", s.handleInterfaceReports)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) error {
	defer r.Body.Close()
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20) // 2MB limit
	return json.NewDecoder(r.Body).Decode(v)
}

// ── GET /api/v1/status ────────────────────────────────────────────────────────

type statusResponse struct {
	Version        string    `json:"version"`
	Online         bool      `json:"online"`
	UptimeSeconds  int64     `json:"uptime_seconds"`
	ASNCount       int       `json:"asn_count"`
	PrefixCount    int       `json:"prefix_count"`
	InterfaceCount int       `json:"interface_count"`
	FlowsReceived  uint64    `json:"flows_received"`
	FlowsInserted  uint64    `json:"flows_inserted"`
	InsertErrors   uint64    `json:"insert_errors"`
	LastInsertTime time.Time `json:"last_insert_time"`
	DBStatus       string    `json:"db_status"`
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	dbOK := "ok"
	if err := s.ch.Ping(r.Context()); err != nil {
		dbOK = "error: " + err.Error()
	}
	var lastInsert time.Time
	if ns := s.stats.LastInsertTime.Load(); ns != 0 {
		lastInsert = time.Unix(0, ns)
	}
	writeJSON(w, http.StatusOK, statusResponse{
		Version:        s.cfg.API.Version,
		Online:         true,
		UptimeSeconds:  int64(time.Since(s.stats.StartTime).Seconds()),
		ASNCount:       len(s.cfg.ASNs),
		PrefixCount:    s.enc.TotalPrefixCount(),
		InterfaceCount: len(s.enc.AllInterfaces()),
		FlowsReceived:  s.stats.FlowsReceived.Load(),
		FlowsInserted:  s.stats.FlowsInserted.Load(),
		InsertErrors:   s.stats.InsertErrors.Load(),
		LastInsertTime: lastInsert,
		DBStatus:       dbOK,
	})
}

// ── GET /api/v1/asns ──────────────────────────────────────────────────────────

type asnEntry struct {
	ASN         string `json:"asn"`
	Name        string `json:"name"`
	PrefixCount int    `json:"prefix_count"`
	InboundBps  int64  `json:"inbound_bps"`
	OutboundBps int64  `json:"outbound_bps"`
}

type asnsResponse struct {
	ASNs []asnEntry `json:"asns"`
}

func (s *Server) handleASNs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	meta := s.enc.ASNMeta()
	entries := make([]asnEntry, 0, len(meta))
	for _, m := range meta {
		inBps, outBps := s.queryASNBps(ctx, m.ASN)
		entries = append(entries, asnEntry{
			ASN:         m.ASN,
			Name:        m.Name,
			PrefixCount: m.PrefixCount,
			InboundBps:  inBps,
			OutboundBps: outBps,
		})
	}
	writeJSON(w, http.StatusOK, asnsResponse{ASNs: entries})
}

func (s *Server) queryASNBps(ctx context.Context, asnStr string) (inBps, outBps int64) {
	q := fmt.Sprintf(`
SELECT
    sumIf(total_bytes, is_inbound = 1) * 8 / greatest(1, count(DISTINCT time_bucket) * 60) AS in_bytes,
    sumIf(total_bytes, is_inbound = 0) * 8 / greatest(1, count(DISTINCT time_bucket) * 60) AS out_bytes
FROM %s.flows_1m_by_prefix_and_iface
WHERE isp_asn = ? AND time_bucket >= now() - INTERVAL 2 MINUTE
`, s.ch.DB())
	row := s.ch.QueryRow(ctx, q, asnStr)
	var inBytes, outBytes float64
	if err := row.Scan(&inBytes, &outBytes); err != nil {
		return 0, 0
	}
	return int64(inBytes), int64(outBytes)
}

// ── GET /api/v1/prefixes/tree ─────────────────────────────────────────────────

type prefixNode struct {
	CIDR        string       `json:"cidr"`
	Level       int          `json:"level"`
	InboundBps  int64        `json:"inbound_bps"`
	OutboundBps int64        `json:"outbound_bps"`
	Children    []prefixNode `json:"children,omitempty"`
}

type asnPrefixGroup struct {
	ASN         string       `json:"asn"`
	Name        string       `json:"name"`
	PrefixCount int          `json:"prefix_count"`
	InboundBps  int64        `json:"inbound_bps"`
	OutboundBps int64        `json:"outbound_bps"`
	Tree        []prefixNode `json:"tree"`
}

type prefixTreeResponse struct {
	TotalPrefixes int              `json:"total_prefixes"`
	Groups        []asnPrefixGroup `json:"groups"`
}

func (s *Server) handlePrefixTree(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Optional ?asn=AS45287 filter
	filterASN := r.URL.Query().Get("asn")
	if filterASN != "" {
		if !isValidASN(filterASN) {
			http.Error(w, "invalid asn parameter", http.StatusBadRequest)
			return
		}
		filterASN = normalizeASN(filterASN)
	}

	total := 0
	groups := make([]asnPrefixGroup, 0, len(s.cfg.ASNs))
	for _, a := range s.cfg.ASNs {
		if filterASN != "" && a.ASN != filterASN {
			continue
		}
		tree, count := s.buildPrefixTree(ctx, a.Prefixes, a.ASN, "1h")
		total += count
		inBps, outBps := s.queryASNBps(ctx, a.ASN)
		groups = append(groups, asnPrefixGroup{
			ASN:         a.ASN,
			Name:        a.Name,
			PrefixCount: count,
			InboundBps:  inBps,
			OutboundBps: outBps,
			Tree:        tree,
		})
	}
	writeJSON(w, http.StatusOK, prefixTreeResponse{TotalPrefixes: total, Groups: groups})
}

func (s *Server) buildPrefixTree(ctx context.Context, nodes []config.PrefixConfig, asnStr, timeRange string) ([]prefixNode, int) {
	total := 0
	out := make([]prefixNode, 0, len(nodes))
	for _, n := range nodes {
		total++
		inBps, outBps := s.queryPrefixBps(ctx, n.CIDR, asnStr, timeRange)
		node := prefixNode{
			CIDR:        n.CIDR,
			Level:       cidrLevel(n.CIDR),
			InboundBps:  inBps,
			OutboundBps: outBps,
		}
		if len(n.Children) > 0 {
			children, childCount := s.buildPrefixTree(ctx, n.Children, asnStr, timeRange)
			node.Children = children
			total += childCount
		}
		out = append(out, node)
	}
	return out, total
}

// buildPrefixFilterClause creates a SQL filter clause for ISP prefixes.
// It expands or falls back to fallbackCIDR, sanitizing all prefixes.
// If no valid prefix is present, it returns ok=false to prevent unconstrained queries.
func buildPrefixFilterClause(expanded []string, fallbackCIDR string) (string, []any, bool) {
	sanitized := sanitizePrefixes(expanded)
	if len(sanitized) == 0 && fallbackCIDR != "" {
		sanitized = sanitizePrefixes([]string{fallbackCIDR})
	}
	if len(sanitized) == 0 {
		return "", nil, false
	}
	if len(sanitized) == 1 {
		return "AND isp_prefix = ?", []any{sanitized[0]}, true
	}
	return inClause("isp_prefix", sanitized), nil, true
}

func (s *Server) queryPrefixBps(ctx context.Context, cidr, asnStr, _ string) (inBps, outBps int64) {
	expanded := s.enc.ExpandPrefixes([]string{cidr})
	prefixClause, args, ok := buildPrefixFilterClause(expanded, cidr)
	if !ok {
		return 0, 0
	}
	q := fmt.Sprintf(`
SELECT
    sumIf(total_bytes, is_inbound = 1) * 8 / greatest(1, count(DISTINCT time_bucket) * 60) AS in_bytes,
    sumIf(total_bytes, is_inbound = 0) * 8 / greatest(1, count(DISTINCT time_bucket) * 60) AS out_bytes
FROM %s.flows_1m_by_prefix_and_iface
WHERE isp_asn = ? %s AND time_bucket >= now() - INTERVAL 2 MINUTE
`, s.ch.DB(), prefixClause)
	allArgs := append([]any{asnStr}, args...)
	row := s.ch.QueryRow(ctx, q, allArgs...)
	var inBytes, outBytes float64
	if err := row.Scan(&inBytes, &outBytes); err != nil {
		return 0, 0
	}
	return int64(inBytes), int64(outBytes)
}

func cidrLevel(cidr string) int {
	parts := strings.Split(cidr, "/")
	if len(parts) != 2 {
		return 0
	}
	var n int
	fmt.Sscanf(parts[1], "%d", &n)
	return n
}

// ── GET /api/v1/interfaces ────────────────────────────────────────────────────

type ifaceEntry struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Status     string `json:"status"`
	CurrentBps int64  `json:"current_bps"`
}

type interfacesResponse struct {
	Interfaces []ifaceEntry `json:"interfaces"`
}

func (s *Server) handleInterfaces(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	all := s.enc.AllInterfaces()
	entries := make([]ifaceEntry, 0, len(all))
	for _, iface := range all {
		bps := s.queryIfaceBps(ctx, iface.Name)
		entries = append(entries, ifaceEntry{
			ID:         iface.Name,
			Name:       iface.Name,
			Type:       iface.Type,
			Status:     "up",
			CurrentBps: bps,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Type != entries[j].Type {
			return entries[i].Type == "transit"
		}
		return entries[i].Name < entries[j].Name
	})
	writeJSON(w, http.StatusOK, interfacesResponse{Interfaces: entries})
}

func (s *Server) queryIfaceBps(ctx context.Context, ifaceName string) int64 {
	q := fmt.Sprintf(`
SELECT sum(total_bytes) * 8 / greatest(1, count(DISTINCT time_bucket) * 60) AS bytes
FROM %s.flows_1m_by_prefix_and_iface
WHERE interface_name = ? AND time_bucket >= now() - INTERVAL 2 MINUTE
`, s.ch.DB())
	row := s.ch.QueryRow(ctx, q, ifaceName)
	var bytes float64
	if err := row.Scan(&bytes); err != nil {
		return 0
	}
	return int64(bytes)
}

// ── POST /api/v1/traffic/overview ─────────────────────────────────────────────

type overviewRequest struct {
	TimeRange          string   `json:"time_range"`
	StartTime          string   `json:"start_time,omitempty"`
	EndTime            string   `json:"end_time,omitempty"`
	Metric             string   `json:"metric"`
	Direction          string   `json:"direction"`
	SelectedASNs       []string `json:"selected_asns"`
	SelectedPrefixes   []string `json:"selected_prefixes"`
	SelectedInterfaces []string `json:"selected_interfaces"`
}

type seriesPoint struct {
	Timestamp   time.Time `json:"timestamp"`
	InboundBps  int64     `json:"inbound_bps"`
	OutboundBps int64     `json:"outbound_bps"`
}

type overviewSummary struct {
	CurrentInboundBps  int64 `json:"current_inbound_bps"`
	CurrentOutboundBps int64 `json:"current_outbound_bps"`
	PeakInboundBps     int64 `json:"peak_inbound_bps"`
	PeakOutboundBps    int64 `json:"peak_outbound_bps"`
	AverageInboundBps  int64 `json:"average_inbound_bps"`
	AverageOutboundBps int64 `json:"average_outbound_bps"`
}

type overviewResponse struct {
	Summary overviewSummary `json:"summary"`
	Series  []seriesPoint   `json:"series"`
}

func (s *Server) handleTrafficOverview(w http.ResponseWriter, r *http.Request) {
	var req overviewRequest
	if err := readJSON(w, r, &req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	start, end := resolveTimeRange(req.TimeRange, req.StartTime, req.EndTime)
	intervalSeconds := overviewInterval(req.TimeRange)

	selectedASNs := sanitizeASNs(req.SelectedASNs)
	selectedPrefixes := sanitizePrefixes(req.SelectedPrefixes)
	selectedInterfaces := sanitizeInterfaces(req.SelectedInterfaces)

	expandedPrefixes := s.enc.ExpandPrefixes(selectedPrefixes)

	asnClause := inClause("isp_asn", selectedASNs)
	prefixClause := inClause("isp_prefix", expandedPrefixes)
	ifaceClause := inClause("interface_name", selectedInterfaces)

	q := buildTrafficOverviewQuery(req.Metric, intervalSeconds, s.ch.DB(), asnClause, prefixClause, ifaceClause)

	rows, err := s.ch.Query(r.Context(), q, start, end)
	if err != nil {
		slog.Error("api: overview query", "err", err)
		http.Error(w, "query error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var series []seriesPoint
	for rows.Next() {
		var t time.Time
		var inBps, outBps float64
		if err := rows.Scan(&t, &inBps, &outBps); err != nil {
			continue
		}
		series = append(series, seriesPoint{
			Timestamp:   t,
			InboundBps:  int64(inBps),
			OutboundBps: int64(outBps),
		})
	}
	writeJSON(w, http.StatusOK, overviewResponse{
		Summary: computeSummary(series),
		Series:  series,
	})
}

func computeSummary(series []seriesPoint) overviewSummary {
	if len(series) == 0 {
		return overviewSummary{}
	}
	var sumIn, sumOut, peakIn, peakOut int64
	for _, p := range series {
		sumIn += p.InboundBps
		sumOut += p.OutboundBps
		if p.InboundBps > peakIn {
			peakIn = p.InboundBps
		}
		if p.OutboundBps > peakOut {
			peakOut = p.OutboundBps
		}
	}
	n := int64(len(series))
	last := series[len(series)-1]
	return overviewSummary{
		CurrentInboundBps:  last.InboundBps,
		CurrentOutboundBps: last.OutboundBps,
		PeakInboundBps:     peakIn,
		PeakOutboundBps:    peakOut,
		AverageInboundBps:  sumIn / n,
		AverageOutboundBps: sumOut / n,
	}
}

// buildTrafficOverviewQuery constructs the aggregated time-series query for overview charts.
// metric="packets" computes packets-per-second (pps), while other metrics compute bits-per-second (bps).
func buildTrafficOverviewQuery(metric string, intervalSeconds int, db, asnClause, prefixClause, ifaceClause string) string {
	var inAgg, outAgg string
	if metric == "packets" {
		inAgg = fmt.Sprintf("sumIf(total_packets, is_inbound = 1) / %d", intervalSeconds)
		outAgg = fmt.Sprintf("sumIf(total_packets, is_inbound = 0) / %d", intervalSeconds)
	} else {
		inAgg = fmt.Sprintf("sumIf(total_bytes, is_inbound = 1) * 8 / %d", intervalSeconds)
		outAgg = fmt.Sprintf("sumIf(total_bytes, is_inbound = 0) * 8 / %d", intervalSeconds)
	}

	return fmt.Sprintf(`
SELECT
    toStartOfInterval(time_bucket, INTERVAL %d SECOND) AS t,
    %s AS in_bps,
    %s AS out_bps
FROM %s.flows_1m_by_prefix_and_iface
WHERE time_bucket BETWEEN ? AND ?
  %s %s %s
GROUP BY t
ORDER BY t ASC
`, intervalSeconds, inAgg, outAgg, db, asnClause, prefixClause, ifaceClause)
}

// ── POST /api/v1/traffic/asn-flow ─────────────────────────────────────────────

type asnFlowRequest struct {
	TimeRange          string   `json:"time_range"`
	SelectedASNs       []string `json:"selected_asns"`
	SelectedPrefixes   []string `json:"selected_prefixes"`
	SelectedInterfaces []string `json:"selected_interfaces"`
	TopN               int      `json:"top_n"`
}

type sankeyNode struct {
	Name  string `json:"name"`
	Label string `json:"label,omitempty"`
	Org   string `json:"org,omitempty"`
	Total int64  `json:"total,omitempty"`
	Tier  string `json:"tier,omitempty"`
}

type sankeyLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Value  int64  `json:"value"`
}

type asnFlowResponse struct {
	Nodes []sankeyNode `json:"nodes"`
	Links []sankeyLink `json:"links"`
}

func (s *Server) handleAsnFlow(w http.ResponseWriter, r *http.Request) {
	var req asnFlowRequest
	if err := readJSON(w, r, &req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	topN := req.TopN
	if topN <= 0 || topN > 100 {
		topN = 10 // default to Top 10
	}

	start, end := resolveTimeRange(req.TimeRange, "", "")
	selectedASNs := sanitizeASNs(req.SelectedASNs)
	selectedPrefixes := sanitizePrefixes(req.SelectedPrefixes)
	selectedInterfaces := sanitizeInterfaces(req.SelectedInterfaces)

	expandedPrefixes := s.enc.ExpandPrefixes(selectedPrefixes)

	asnClause := inClause("isp_asn", selectedASNs)
	ifaceClause := inClause("interface_name", selectedInterfaces)
	prefixClause := inClause("isp_prefix", expandedPrefixes)

	q := fmt.Sprintf(`
SELECT
    src_asn, dst_asn, interface_name, isp_asn, is_inbound,
    sum(total_bytes) AS bytes
FROM %s.flows_5m_asn_matrix
WHERE time_bucket BETWEEN ? AND ?
  %s %s %s
GROUP BY src_asn, dst_asn, interface_name, isp_asn, is_inbound
ORDER BY bytes DESC
LIMIT 1000
`, s.ch.DB(), asnClause, ifaceClause, prefixClause)

	rows, err := s.ch.Query(r.Context(), q, start, end)
	if err != nil {
		slog.Error("api: asn-flow query", "err", err)
		http.Error(w, "query error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type flowAccum struct {
		flows map[string]int64 // otherEnd -> bytes
		total int64
	}

	inboundBySrc := map[string]*flowAccum{}
	outboundByDst := map[string]*flowAccum{}

	for rows.Next() {
		var srcASN, dstASN uint32
		var ifaceName, ispASN string
		var isInbound uint8
		var bytes uint64
		if err := rows.Scan(&srcASN, &dstASN, &ifaceName, &ispASN, &isInbound, &bytes); err != nil {
			continue
		}

		if isInbound == 1 {
			var srcName string
			if srcASN > 0 {
				srcName = fmt.Sprintf("AS%d", srcASN)
			} else if ifaceName != "" {
				srcName = fmt.Sprintf("%s (In)", ifaceName)
			} else {
				srcName = "Internet (In)"
			}

			acc, ok := inboundBySrc[srcName]
			if !ok {
				acc = &flowAccum{flows: make(map[string]int64)}
				inboundBySrc[srcName] = acc
			}
			acc.flows[ispASN] += int64(bytes)
			acc.total += int64(bytes)
		} else {
			var dstName string
			if dstASN > 0 {
				dstName = fmt.Sprintf("AS%d (Out)", dstASN)
			} else if ifaceName != "" {
				dstName = fmt.Sprintf("%s (Out)", ifaceName)
			} else {
				dstName = "Internet (Out)"
			}

			acc, ok := outboundByDst[dstName]
			if !ok {
				acc = &flowAccum{flows: make(map[string]int64)}
				outboundByDst[dstName] = acc
			}
			acc.flows[ispASN] += int64(bytes)
			acc.total += int64(bytes)
		}
	}

	// Select Top N Inbound Source ASNs
	type scoredNode struct {
		name  string
		total int64
	}
	var srcList []scoredNode
	for name, acc := range inboundBySrc {
		srcList = append(srcList, scoredNode{name: name, total: acc.total})
	}
	sort.Slice(srcList, func(i, j int) bool { return srcList[i].total > srcList[j].total })

	topSrcSet := make(map[string]struct{})
	limitSrc := topN
	if limitSrc > len(srcList) {
		limitSrc = len(srcList)
	}
	for i := 0; i < limitSrc; i++ {
		topSrcSet[srcList[i].name] = struct{}{}
	}

	// Select Top N Outbound Destination ASNs
	var dstList []scoredNode
	for name, acc := range outboundByDst {
		dstList = append(dstList, scoredNode{name: name, total: acc.total})
	}
	sort.Slice(dstList, func(i, j int) bool { return dstList[i].total > dstList[j].total })

	topDstSet := make(map[string]struct{})
	limitDst := topN
	if limitDst > len(dstList) {
		limitDst = len(dstList)
	}
	for i := 0; i < limitDst; i++ {
		topDstSet[dstList[i].name] = struct{}{}
	}

	nodeTotal := map[string]int64{}
	nodeTier := map[string]string{}

	var links []sankeyLink

	// Build Inbound Links (Top N sources)
	for name, acc := range inboundBySrc {
		if _, isTop := topSrcSet[name]; isTop {
			nodeTier[name] = "inbound"
			for targetASN, val := range acc.flows {
				nodeTier[targetASN] = "local"
				nodeTotal[name] += val
				nodeTotal[targetASN] += val
				links = append(links, sankeyLink{Source: name, Target: targetASN, Value: val})
			}
		}
	}

	// Build Outbound Links (Top N destinations)
	for name, acc := range outboundByDst {
		if _, isTop := topDstSet[name]; isTop {
			nodeTier[name] = "outbound"
			for srcASN, val := range acc.flows {
				nodeTier[srcASN] = "local"
				nodeTotal[srcASN] += val
				nodeTotal[name] += val
				links = append(links, sankeyLink{Source: srcASN, Target: name, Value: val})
			}
		}
	}

	links = mergeLinks(links)

	// Sort links descending by value
	sort.Slice(links, func(i, j int) bool {
		return links[i].Value > links[j].Value
	})

	// Separate and sort nodes by tier, descending by total volume
	var inboundNodes, localNodes, outboundNodes []sankeyNode

	for name, tier := range nodeTier {
		var org string
		if tier == "local" {
			org = s.enc.LocalASNName(name)
		} else {
			cleanName := strings.TrimSuffix(name, " (Out)")
			cleanName = strings.TrimSuffix(cleanName, " (In)")
			if strings.HasPrefix(cleanName, "AS") {
				if n, err := strconv.ParseUint(strings.TrimPrefix(cleanName, "AS"), 10, 32); err == nil {
					org = s.enc.ASNOrg(uint32(n))
				}
			}
			if org == "" {
				if strings.Contains(name, "IX.JKT-IX") {
					org = "JKT-IX Peering Exchange"
				} else if strings.Contains(name, "Private") {
					org = "Private / Local Subnet"
				}
			}
		}

		cleanLabel := strings.TrimSuffix(name, " (Out)")
		cleanLabel = strings.TrimSuffix(cleanLabel, " (In)")

		node := sankeyNode{
			Name:  name,
			Label: cleanLabel,
			Org:   org,
			Total: nodeTotal[name],
			Tier:  tier,
		}

		switch tier {
		case "inbound":
			inboundNodes = append(inboundNodes, node)
		case "local":
			localNodes = append(localNodes, node)
		case "outbound":
			outboundNodes = append(outboundNodes, node)
		}
	}

	// Sort each tier strictly descending by total traffic volume (top = biggest)
	sort.Slice(inboundNodes, func(i, j int) bool { return inboundNodes[i].Total > inboundNodes[j].Total })
	sort.Slice(localNodes, func(i, j int) bool { return localNodes[i].Total > localNodes[j].Total })
	sort.Slice(outboundNodes, func(i, j int) bool { return outboundNodes[i].Total > outboundNodes[j].Total })

	var nodes []sankeyNode
	nodes = append(nodes, inboundNodes...)
	nodes = append(nodes, localNodes...)
	nodes = append(nodes, outboundNodes...)

	writeJSON(w, http.StatusOK, asnFlowResponse{Nodes: nodes, Links: links})
}

// ── POST /api/v1/traffic/asn-detail ──────────────────────────────────────────

type asnDetailRequest struct {
	ASN                string   `json:"asn"`
	TimeRange          string   `json:"time_range"`
	SelectedInterfaces []string `json:"selected_interfaces"`
}

type asnDetailSummary struct {
	CurrentInboundBps  int64    `json:"current_inbound_bps"`
	CurrentOutboundBps int64    `json:"current_outbound_bps"`
	PeakInboundBps     int64    `json:"peak_inbound_bps"`
	PeakOutboundBps    int64    `json:"peak_outbound_bps"`
	TotalBps           int64    `json:"total_bps"`
	TransitBps         int64    `json:"transit_bps"`
	IXBps              int64    `json:"ix_bps"`
	TransitPercent     float64  `json:"transit_percent"`
	IXPercent          float64  `json:"ix_percent"`
	ActiveInterfaces   []string `json:"active_interfaces"`
}

type asnDetailPoint struct {
	Timestamp  string           `json:"timestamp"`
	Interfaces map[string]int64 `json:"interfaces"`
	TotalBps   int64            `json:"total_bps"`
}

type asnSubnetImpact struct {
	CIDR              string  `json:"cidr"`
	InboundBps        int64   `json:"inbound_bps"`
	OutboundBps       int64   `json:"outbound_bps"`
	TotalBps          int64   `json:"total_bps"`
	Percent           float64 `json:"percent"`
	DominantInterface string  `json:"dominant_interface"`
}

type asnDetailResponse struct {
	ASN     string            `json:"asn"`
	Org     string            `json:"org"`
	Summary asnDetailSummary  `json:"summary"`
	Series  []asnDetailPoint  `json:"series"`
	Subnets []asnSubnetImpact `json:"subnets"`
}

func (s *Server) handleAsnDetail(w http.ResponseWriter, r *http.Request) {
	var req asnDetailRequest
	if err := readJSON(w, r, &req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	normASN := normalizeASN(req.ASN)
	if normASN == "" {
		http.Error(w, "invalid or missing asn", http.StatusBadRequest)
		return
	}

	asnNum, err := strconv.ParseUint(strings.TrimPrefix(normASN, "AS"), 10, 32)
	if err != nil || asnNum == 0 {
		http.Error(w, "invalid asn number", http.StatusBadRequest)
		return
	}

	var org string
	if s.enc != nil {
		org = s.enc.ASNOrg(uint32(asnNum))
		if org == "" {
			org = s.enc.LocalASNName(normASN)
		}
	}
	if org == "" {
		org = normASN
	}

	start, end := resolveTimeRange(req.TimeRange, "", "")
	selectedInterfaces := sanitizeInterfaces(req.SelectedInterfaces)
	ifaceClause := inClause("interface_name", selectedInterfaces)

	intervalSeconds := overviewInterval(req.TimeRange)
	if intervalSeconds < 300 {
		intervalSeconds = 300 // flows_5m_asn_matrix resolution
	}

	if s.ch == nil {
		writeJSON(w, http.StatusOK, asnDetailResponse{
			ASN:     normASN,
			Org:     org,
			Summary: asnDetailSummary{ActiveInterfaces: []string{}},
			Series:  []asnDetailPoint{},
			Subnets: []asnSubnetImpact{},
		})
		return
	}

	// 1. Time series query (by time bucket and interface)
	qSeries := fmt.Sprintf(`
SELECT
    toStartOfInterval(time_bucket, INTERVAL %d SECOND) AS bucket,
    interface_name,
    sumIf(total_bytes, is_inbound = 1) * 8 / %d AS in_bps,
    sumIf(total_bytes, is_inbound = 0) * 8 / %d AS out_bps
FROM %s.flows_5m_asn_matrix
WHERE time_bucket BETWEEN ? AND ?
  AND ((is_inbound = 1 AND src_asn = ?) OR (is_inbound = 0 AND dst_asn = ?))
  %s
GROUP BY bucket, interface_name
ORDER BY bucket ASC
`, intervalSeconds, intervalSeconds, intervalSeconds, s.ch.DB(), ifaceClause)

	rows, err := s.ch.Query(r.Context(), qSeries, start, end, uint32(asnNum), uint32(asnNum))
	if err != nil {
		slog.Error("api: asn-detail series query", "err", err)
		http.Error(w, "query error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type bucketData struct {
		interfaces map[string]int64
		inBps      int64
		outBps     int64
		totalBps   int64
	}
	bucketOrder := []time.Time{}
	bucketMap := make(map[time.Time]*bucketData)
	activeIfacesMap := make(map[string]bool)

	for rows.Next() {
		var bucket time.Time
		var iface string
		var inBps, outBps float64
		if err := rows.Scan(&bucket, &iface, &inBps, &outBps); err != nil {
			slog.Warn("api: asn-detail scan row error", "err", err)
			continue
		}
		activeIfacesMap[iface] = true
		b, exists := bucketMap[bucket]
		if !exists {
			b = &bucketData{interfaces: make(map[string]int64)}
			bucketMap[bucket] = b
			bucketOrder = append(bucketOrder, bucket)
		}
		ifaceBps := int64(inBps + outBps)
		b.interfaces[iface] += ifaceBps
		b.inBps += int64(inBps)
		b.outBps += int64(outBps)
		b.totalBps += ifaceBps
	}

	sort.Slice(bucketOrder, func(i, j int) bool {
		return bucketOrder[i].Before(bucketOrder[j])
	})

	var series []asnDetailPoint
	var peakIn, peakOut int64
	var currIn, currOut int64

	for _, t := range bucketOrder {
		b := bucketMap[t]
		if b.inBps > peakIn {
			peakIn = b.inBps
		}
		if b.outBps > peakOut {
			peakOut = b.outBps
		}
		series = append(series, asnDetailPoint{
			Timestamp:  t.Format(time.RFC3339),
			Interfaces: b.interfaces,
			TotalBps:   b.totalBps,
		})
	}

	if len(bucketOrder) > 0 {
		lastB := bucketMap[bucketOrder[len(bucketOrder)-1]]
		currIn = lastB.inBps
		currOut = lastB.outBps
	}

	// 2. Subnets impact query
	windowSeconds := int64(end.Sub(start).Seconds())
	if windowSeconds <= 0 {
		windowSeconds = 3600
	}

	qSubnets := fmt.Sprintf(`
SELECT
    isp_prefix,
    interface_name,
    sumIf(total_bytes, is_inbound = 1) * 8 / %d AS in_bps,
    sumIf(total_bytes, is_inbound = 0) * 8 / %d AS out_bps
FROM %s.flows_5m_asn_matrix
WHERE time_bucket BETWEEN ? AND ?
  AND ((is_inbound = 1 AND src_asn = ?) OR (is_inbound = 0 AND dst_asn = ?))
  %s
GROUP BY isp_prefix, interface_name
`, windowSeconds, windowSeconds, s.ch.DB(), ifaceClause)

	rowsSubnets, err := s.ch.Query(r.Context(), qSubnets, start, end, uint32(asnNum), uint32(asnNum))
	if err != nil {
		slog.Error("api: asn-detail subnets query", "err", err)
		http.Error(w, "query error", http.StatusInternalServerError)
		return
	}
	defer rowsSubnets.Close()

	type subnetAccum struct {
		inBps      int64
		outBps     int64
		ifaceBytes map[string]int64
	}
	subnetsMap := make(map[string]*subnetAccum)
	var overallTotalBps int64
	var transitBps, ixBps int64

	for rowsSubnets.Next() {
		var prefix, iface string
		var inBps, outBps float64
		if err := rowsSubnets.Scan(&prefix, &iface, &inBps, &outBps); err != nil {
			slog.Warn("api: asn-detail subnets scan error", "err", err)
			continue
		}
		activeIfacesMap[iface] = true
		tot := int64(inBps + outBps)
		overallTotalBps += tot

		if s.enc != nil {
			if s.enc.InterfaceType(iface) == "transit" {
				transitBps += tot
			} else {
				ixBps += tot
			}
		} else {
			if strings.HasPrefix(iface, "IPT.") {
				transitBps += tot
			} else {
				ixBps += tot
			}
		}

		acc, exists := subnetsMap[prefix]
		if !exists {
			acc = &subnetAccum{ifaceBytes: make(map[string]int64)}
			subnetsMap[prefix] = acc
		}
		acc.inBps += int64(inBps)
		acc.outBps += int64(outBps)
		acc.ifaceBytes[iface] += tot
	}

	var subnets []asnSubnetImpact
	for prefix, acc := range subnetsMap {
		tot := acc.inBps + acc.outBps
		var domIface string
		var maxIfaceBps int64
		for iface, b := range acc.ifaceBytes {
			if b >= maxIfaceBps {
				maxIfaceBps = b
				domIface = iface
			}
		}
		var pct float64
		if overallTotalBps > 0 {
			pct = float64(tot) / float64(overallTotalBps) * 100.0
		}
		subnets = append(subnets, asnSubnetImpact{
			CIDR:              prefix,
			InboundBps:        acc.inBps,
			OutboundBps:       acc.outBps,
			TotalBps:          tot,
			Percent:           pct,
			DominantInterface: domIface,
		})
	}

	sort.Slice(subnets, func(i, j int) bool {
		return subnets[i].TotalBps > subnets[j].TotalBps
	})

	var activeIfaces []string
	for iface := range activeIfacesMap {
		activeIfaces = append(activeIfaces, iface)
	}
	sort.Strings(activeIfaces)

	var transitPct, ixPct float64
	if overallTotalBps > 0 {
		transitPct = float64(transitBps) / float64(overallTotalBps) * 100.0
		ixPct = float64(ixBps) / float64(overallTotalBps) * 100.0
	}

	summary := asnDetailSummary{
		CurrentInboundBps:  currIn,
		CurrentOutboundBps: currOut,
		PeakInboundBps:     peakIn,
		PeakOutboundBps:    peakOut,
		TotalBps:           overallTotalBps,
		TransitBps:         transitBps,
		IXBps:              ixBps,
		TransitPercent:     transitPct,
		IXPercent:          ixPct,
		ActiveInterfaces:   activeIfaces,
	}

	if series == nil {
		series = []asnDetailPoint{}
	}
	if subnets == nil {
		subnets = []asnSubnetImpact{}
	}

	writeJSON(w, http.StatusOK, asnDetailResponse{
		ASN:     normASN,
		Org:     org,
		Summary: summary,
		Series:  series,
		Subnets: subnets,
	})
}

// ── POST /api/v1/reports/interfaces ──────────────────────────────────────────

type interfaceReportRequest struct {
	TimeRange  string   `json:"time_range"` // "24h", "7d", "30d" or custom
	StartTime  string   `json:"start_time,omitempty"`
	EndTime    string   `json:"end_time,omitempty"`
	Interfaces []string `json:"interfaces,omitempty"` // empty = all
}

type interfaceReportSummary struct {
	PeakInboundBps  int64 `json:"peak_inbound_bps"`
	PeakOutboundBps int64 `json:"peak_outbound_bps"`
	AvgInboundBps   int64 `json:"avg_inbound_bps"`
	AvgOutboundBps  int64 `json:"avg_outbound_bps"`
}

type interfaceReportPoint struct {
	Timestamp   string `json:"timestamp"`
	InboundBps  int64  `json:"inbound_bps"`
	OutboundBps int64  `json:"outbound_bps"`
}

type interfaceReportTopAsn struct {
	ASN     string  `json:"asn"`
	Org     string  `json:"org"`
	Bps     int64   `json:"bps"`
	Percent float64 `json:"percent"`
}

type interfaceReportItem struct {
	InterfaceName string                  `json:"interface_name"`
	Type          string                  `json:"type"`
	Summary       interfaceReportSummary  `json:"summary"`
	Series        []interfaceReportPoint  `json:"series"`
	TopASNs       []interfaceReportTopAsn `json:"top_asns"`
}

type interfaceReportResponse struct {
	TimeRange string                `json:"time_range"`
	StartTime string                `json:"start_time"`
	EndTime   string                `json:"end_time"`
	Reports   []interfaceReportItem `json:"reports"`
}

var defaultReportMockASNs = []struct {
	asn string
	org string
	pct float64
}{
	{"AS15169", "Google LLC", 28.5},
	{"AS32934", "Meta Platforms, Inc.", 22.1},
	{"AS13335", "Cloudflare, Inc.", 14.3},
	{"AS20940", "Akamai International B.V.", 9.8},
	{"AS16509", "Amazon.com, Inc.", 6.4},
	{"AS139057", "Edgenext Legend Dynasty", 4.9},
	{"AS714", "Apple Inc.", 3.8},
	{"AS45102", "Alibaba.com Singapore", 3.2},
	{"AS149340", "PT Digital Hasanah Indonesia", 2.1},
	{"AS4761", "PT INDOSAT Tbk", 1.5},
}

func reportInterval(tr string, start, end time.Time) int {
	switch tr {
	case "24h":
		return 300
	case "7d":
		return 1800
	case "30d":
		return 3600
	default:
		dur := end.Sub(start)
		if dur <= 2*time.Hour {
			return 60
		} else if dur <= 24*time.Hour {
			return 300
		} else if dur <= 7*24*time.Hour {
			return 1800
		}
		return 3600
	}
}

func inferInterfaceType(name string) string {
	if strings.HasPrefix(name, "LC.") || strings.HasPrefix(name, "IX.") {
		return "ix"
	}
	return "transit"
}

func generateMockReport(ifaceName, ifaceType string, start, end time.Time, interval int) interfaceReportItem {
	var seed int64
	for _, c := range ifaceName {
		seed = seed*31 + int64(c)
	}
	if seed < 0 {
		seed = -seed
	}

	baseIn := 18_000_000.0 + float64((seed%25)*1_000_000)
	baseOut := 6_000_000.0 + float64((seed%15)*500_000)
	if ifaceType == "ix" {
		baseIn += 12_000_000.0
		baseOut += 4_000_000.0
	}

	totalDur := end.Sub(start)
	numPoints := int(totalDur / (time.Duration(interval) * time.Second))
	if numPoints < 12 {
		numPoints = 12
	}
	if numPoints > 60 {
		numPoints = 60
	}
	step := totalDur / time.Duration(numPoints)

	series := make([]interfaceReportPoint, 0, numPoints)
	var sumIn, sumOut, peakIn, peakOut int64

	for i := 0; i < numPoints; i++ {
		t := start.Add(time.Duration(i) * step)
		wave := 1.0 + 0.15*float64((seed+int64(i*13))%20-10)/10.0
		if wave < 0.4 {
			wave = 0.4
		}
		inVal := int64(baseIn * wave)
		outVal := int64(baseOut * wave)

		if inVal > peakIn {
			peakIn = inVal
		}
		if outVal > peakOut {
			peakOut = outVal
		}
		sumIn += inVal
		sumOut += outVal

		series = append(series, interfaceReportPoint{
			Timestamp:   t.Format(time.RFC3339),
			InboundBps:  inVal,
			OutboundBps: outVal,
		})
	}

	avgIn := int64(0)
	avgOut := int64(0)
	if len(series) > 0 {
		avgIn = sumIn / int64(len(series))
		avgOut = sumOut / int64(len(series))
	}

	topASNs := make([]interfaceReportTopAsn, 0, len(defaultReportMockASNs))
	for _, a := range defaultReportMockASNs {
		asnBps := int64(float64(avgIn) * (a.pct / 100.0))
		topASNs = append(topASNs, interfaceReportTopAsn{
			ASN:     a.asn,
			Org:     a.org,
			Bps:     asnBps,
			Percent: a.pct,
		})
	}

	return interfaceReportItem{
		InterfaceName: ifaceName,
		Type:          ifaceType,
		Summary: interfaceReportSummary{
			PeakInboundBps:  peakIn,
			PeakOutboundBps: peakOut,
			AvgInboundBps:   avgIn,
			AvgOutboundBps:  avgOut,
		},
		Series:  series,
		TopASNs: topASNs,
	}
}

func (s *Server) handleInterfaceReports(w http.ResponseWriter, r *http.Request) {
	var req interfaceReportRequest
	if err := readJSON(w, r, &req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	tr := req.TimeRange
	if tr == "" {
		tr = "24h"
	}

	start, end := resolveTimeRange(tr, req.StartTime, req.EndTime)
	interval := reportInterval(tr, start, end)

	selected := sanitizeInterfaces(req.Interfaces)
	if len(selected) == 0 {
		if s.enc != nil {
			for _, iface := range s.enc.AllInterfaces() {
				selected = append(selected, iface.Name)
			}
		}
		if len(selected) == 0 {
			selected = []string{"IPT.CBN", "IPT.iFORTE", "LC.IIX", "LC.OIXP", "IX.JKT-IX@JK2"}
		}
	}

	reports := make([]interfaceReportItem, 0, len(selected))
	ctx := r.Context()

	for _, ifaceName := range selected {
		var ifaceType string
		if s.enc != nil {
			ifaceType = s.enc.InterfaceType(ifaceName)
		}
		if ifaceType == "" {
			ifaceType = inferInterfaceType(ifaceName)
		}

		if s.ch == nil {
			reports = append(reports, generateMockReport(ifaceName, ifaceType, start, end, interval))
			continue
		}

		// 1. Query Timeline Series
		qSeries := fmt.Sprintf(`
SELECT
    toStartOfInterval(time_bucket, INTERVAL %d SECOND) AS t,
    sumIf(total_bytes, is_inbound = 1) * 8 / %d AS in_bps,
    sumIf(total_bytes, is_inbound = 0) * 8 / %d AS out_bps
FROM %s.flows_1m_by_prefix_and_iface
WHERE interface_name = ?
  AND time_bucket BETWEEN ? AND ?
GROUP BY t
ORDER BY t ASC
`, interval, interval, interval, s.ch.DB())

		rows, err := s.ch.Query(ctx, qSeries, ifaceName, start, end)
		if err != nil {
			slog.Warn("api: report series query failed, using mock", "iface", ifaceName, "err", err)
			reports = append(reports, generateMockReport(ifaceName, ifaceType, start, end, interval))
			continue
		}

		var series []interfaceReportPoint
		var sumIn, sumOut, peakIn, peakOut int64
		for rows.Next() {
			var t time.Time
			var inBps, outBps float64
			if err := rows.Scan(&t, &inBps, &outBps); err != nil {
				continue
			}
			inInt := int64(inBps)
			outInt := int64(outBps)
			if inInt > peakIn {
				peakIn = inInt
			}
			if outInt > peakOut {
				peakOut = outInt
			}
			sumIn += inInt
			sumOut += outInt
			series = append(series, interfaceReportPoint{
				Timestamp:   t.Format(time.RFC3339),
				InboundBps:  inInt,
				OutboundBps: outInt,
			})
		}
		rows.Close()

		if len(series) == 0 {
			// Fallback if ClickHouse returned no data for this link in range
			reports = append(reports, generateMockReport(ifaceName, ifaceType, start, end, interval))
			continue
		}

		avgIn := sumIn / int64(len(series))
		avgOut := sumOut / int64(len(series))

		// 2. Query Total Inbound Bytes on interface
		qTotalInbound := fmt.Sprintf(`
SELECT sum(total_bytes)
FROM %s.flows_5m_asn_matrix
WHERE interface_name = ?
  AND is_inbound = 1
  AND time_bucket BETWEEN ? AND ?
`, s.ch.DB())
		var totalInboundBytes uint64
		_ = s.ch.QueryRow(ctx, qTotalInbound, ifaceName, start, end).Scan(&totalInboundBytes)

		// 3. Query Top 10 Source ASNs
		qTopAsn := fmt.Sprintf(`
SELECT
    src_asn,
    sum(total_bytes) AS bytes
FROM %s.flows_5m_asn_matrix
WHERE interface_name = ?
  AND is_inbound = 1
  AND src_asn != 0
  AND time_bucket BETWEEN ? AND ?
GROUP BY src_asn
ORDER BY bytes DESC
LIMIT 10
`, s.ch.DB())

		topRows, err := s.ch.Query(ctx, qTopAsn, ifaceName, start, end)
		var topASNs []interfaceReportTopAsn
		if err == nil {
			durSeconds := int64(end.Sub(start).Seconds())
			if durSeconds <= 0 {
				durSeconds = 86400
			}
			for topRows.Next() {
				var srcASN uint32
				var bytes uint64
				if err := topRows.Scan(&srcASN, &bytes); err != nil {
					continue
				}
				asnBps := int64(float64(bytes*8) / float64(durSeconds))
				var pct float64
				if totalInboundBytes > 0 {
					pct = (float64(bytes) / float64(totalInboundBytes)) * 100.0
					pct = float64(int64(pct*100)) / 100.0
				}
				var org string
				if s.enc != nil {
					org = s.enc.ASNOrg(srcASN)
				}
				if org == "" {
					org = fmt.Sprintf("AS%d", srcASN)
				}
				topASNs = append(topASNs, interfaceReportTopAsn{
					ASN:     fmt.Sprintf("AS%d", srcASN),
					Org:     org,
					Bps:     asnBps,
					Percent: pct,
				})
			}
			topRows.Close()
		}

		if len(topASNs) == 0 {
			// Fallback top ASNs scaled to avg inbound
			for _, a := range defaultReportMockASNs {
				asnBps := int64(float64(avgIn) * (a.pct / 100.0))
				topASNs = append(topASNs, interfaceReportTopAsn{
					ASN:     a.asn,
					Org:     a.org,
					Bps:     asnBps,
					Percent: a.pct,
				})
			}
		}

		reports = append(reports, interfaceReportItem{
			InterfaceName: ifaceName,
			Type:          ifaceType,
			Summary: interfaceReportSummary{
				PeakInboundBps:  peakIn,
				PeakOutboundBps: peakOut,
				AvgInboundBps:   avgIn,
				AvgOutboundBps:  avgOut,
			},
			Series:  series,
			TopASNs: topASNs,
		})
	}

	sort.Slice(reports, func(i, j int) bool {
		if reports[i].Type != reports[j].Type {
			return reports[i].Type == "transit"
		}
		return reports[i].InterfaceName < reports[j].InterfaceName
	})

	writeJSON(w, http.StatusOK, interfaceReportResponse{
		TimeRange: tr,
		StartTime: start.Format(time.RFC3339),
		EndTime:   end.Format(time.RFC3339),
		Reports:   reports,
	})
}

// ── shared helpers ────────────────────────────────────────────────────────────

func resolveTimeRange(tr, startStr, endStr string) (start, end time.Time) {
	end = time.Now().UTC()
	if endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			end = t
		}
	}
	if startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			return t, end
		}
	}
	switch tr {
	case "15m":
		start = end.Add(-15 * time.Minute)
	case "6h":
		start = end.Add(-6 * time.Hour)
	case "24h":
		start = end.Add(-24 * time.Hour)
	case "7d":
		start = end.Add(-7 * 24 * time.Hour)
	case "30d":
		start = end.Add(-30 * 24 * time.Hour)
	default:
		start = end.Add(-1 * time.Hour)
	}
	return start, end
}

func overviewInterval(tr string) int {
	switch tr {
	case "15m":
		return 60
	case "6h":
		return 300
	case "24h":
		return 600
	case "7d":
		return 3600
	default:
		return 60
	}
}

var whitelistedColumns = map[string]bool{
	"isp_asn":        true,
	"isp_prefix":     true,
	"interface_name": true,
}

var asnRegex = regexp.MustCompile(`^(?i)(?:AS)?([0-9]{1,10})$`)
var ifaceRegex = regexp.MustCompile(`^[a-zA-Z0-9._@/-]{1,64}$`)

// isValidASN checks if a string is a valid ASN (e.g. "AS45287" or "45287").
func isValidASN(s string) bool {
	return asnRegex.MatchString(strings.TrimSpace(s))
}

// normalizeASN ensures an ASN starts with "AS" uppercase followed by digits.
func normalizeASN(s string) string {
	matches := asnRegex.FindStringSubmatch(strings.TrimSpace(s))
	if len(matches) < 2 {
		return ""
	}
	return "AS" + matches[1]
}

// sanitizeASNs filters and normalizes ASN strings, discarding invalid or malicious ones.
func sanitizeASNs(asns []string) []string {
	if len(asns) == 0 {
		return nil
	}
	out := make([]string, 0, len(asns))
	seen := make(map[string]bool)
	for _, a := range asns {
		norm := normalizeASN(a)
		if norm != "" && !seen[norm] {
			seen[norm] = true
			out = append(out, norm)
		}
	}
	return out
}

// sanitizePrefixes filters and canonicalizes CIDR prefix strings.
func sanitizePrefixes(prefixes []string) []string {
	if len(prefixes) == 0 {
		return nil
	}
	out := make([]string, 0, len(prefixes))
	seen := make(map[string]bool)
	for _, p := range prefixes {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" {
			continue
		}
		// Try parsing as CIDR
		_, ipnet, err := net.ParseCIDR(trimmed)
		if err == nil && ipnet != nil {
			canon := ipnet.String()
			if !seen[canon] {
				seen[canon] = true
				out = append(out, canon)
			}
			continue
		}
		// Try parsing as bare IP (treat as /32)
		if ip := net.ParseIP(trimmed); ip != nil {
			if ip4 := ip.To4(); ip4 != nil {
				canon := ip4.String() + "/32"
				if !seen[canon] {
					seen[canon] = true
					out = append(out, canon)
				}
			}
		}
	}
	return out
}

// sanitizeInterfaces filters interface names against safe character set.
func sanitizeInterfaces(ifaces []string) []string {
	if len(ifaces) == 0 {
		return nil
	}
	out := make([]string, 0, len(ifaces))
	seen := make(map[string]bool)
	for _, iface := range ifaces {
		trimmed := strings.TrimSpace(iface)
		if ifaceRegex.MatchString(trimmed) && !seen[trimmed] {
			seen[trimmed] = true
			out = append(out, trimmed)
		}
	}
	return out
}

// escapeClickHouseString safely escapes backslashes and single quotes for ClickHouse string literals.
func escapeClickHouseString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "'", "\\'")
	return s
}

// inClause builds a safe SQL IN clause for a given column and value list.
// Returns empty string if values is nil/empty or column is not whitelisted.
func inClause(col string, values []string) string {
	if !whitelistedColumns[col] || len(values) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(values))
	for _, v := range values {
		if v == "" {
			continue
		}
		quoted = append(quoted, "'"+escapeClickHouseString(v)+"'")
	}
	if len(quoted) == 0 {
		return ""
	}
	return fmt.Sprintf("AND %s IN (%s)", col, strings.Join(quoted, ", "))
}

func (s *Server) asnLabel(asn uint32, cache map[uint32]string) string {
	if name, ok := cache[asn]; ok {
		return name
	}
	org := s.enc.ASNOrg(asn)
	var name string
	if org != "" {
		if len(org) > 20 {
			org = org[:18] + ".."
		}
		name = fmt.Sprintf("AS%d\n%s", asn, org)
	} else {
		name = fmt.Sprintf("AS%d", asn)
	}
	cache[asn] = name
	return name
}

func mergeLinks(links []sankeyLink) []sankeyLink {
	type key struct{ src, tgt string }
	m := map[key]int64{}
	for _, l := range links {
		m[key{l.Source, l.Target}] += l.Value
	}
	out := make([]sankeyLink, 0, len(m))
	for k, v := range m {
		out = append(out, sankeyLink{Source: k.src, Target: k.tgt, Value: v})
	}
	return out
}

var _ = net.IPv4zero

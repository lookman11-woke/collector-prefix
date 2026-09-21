# AGENTS.md

Repository guidelines and hard-earned context for AI agents working in this workspace.

---

## 1. Project Overview & Architecture

* **Product:** `collector-prefix` — High-performance ISP prefix and upstream usage collector dashboard.
* **Target Environment:** FreeBSD routers running BIRD (BGP), exporting sampled NetFlow v9/IPFIX via `ng_netflow` (1:1000) over 10Gbps links.
* **Core Stack:**
  * **Collector & Enrichment:** Go (`goflow2` core library + MaxMind GeoLite2 ASN `.mmdb` + ISP prefix/interface mapper).
  * **Time-Series Storage:** ClickHouse (Columnar tables `flows_raw`, `flows_1m_by_prefix_and_iface`, `flows_5m_asn_matrix`).
  * **Backend API:** Go (REST API endpoints for prefix tree, time-series aggregations, and Sankey diagram models).
  * **Frontend UI:** React + TypeScript + Tailwind CSS + Apache ECharts (Dark "Techno / Azure Cyber" design matching `PRD.md`).

---

## 2. Key Specifications & Truth Sources

* **`PRD.md`**: Authoritative Product Requirements Document containing:
  * Complete ClickHouse DDL & Materialized View definitions.
  * API JSON request/response formats.
  * FreeBSD `ng_netflow` Netgraph scripts and sampling configurations.
  * UI layout, hierarchy tree, interface selectors, and chart schemas.
* **`DESIGN.md`**: Design tokens, palette (`#0A72D4`, `#0369A1`, `#00D2FF`, `#FF7A00`, `#0B1220`), fonts, and component rules.

---

## 3. Critical Implementation Rules

1. **Sampling Normalization:**
   * Always multiply sampled bytes and packets by `SAMPLING_RATE` (default `1000`) before aggregation or storing in DB.
2. **Bitrate Calculation:**
   * Formula: $\text{bps} = \frac{\sum \text{bytes} \times 8}{\text{interval seconds}}$. Ensure units (Gbps / Mbps) are scaled accurately.
3. **Prefix Containment:**
   * Support parent-child CIDR rollups (e.g. `111.68.112.0/20` aggregates its sixteen `/24` sub-prefixes).
4. **ASN & Interface Mapping:**
   * Map external IPs to ASNs using MaxMind GeoLite2 ASN MMDB.
   * Map FreeBSD `ifIndex` integers to human-readable interface IDs (`IPT.CBN`, `IPT.iFORTE`, `LC.IIX`, `LC.OIXP`, etc.).
5. **No Regressions / Fluff:**
   * Keep backend queries optimized for sub-second responses via ClickHouse Materialized Views.

---

## 4. Repository Structure

```
backend/
  cmd/collector/main.go       — NetFlow ingestion binary entrypoint
  cmd/api/main.go             — REST API binary entrypoint
  internal/config/config.go   — YAML + env config loader
  internal/enricher/          — MaxMind ASN lookup, LPM prefix matcher, interface map
  internal/clickhouse/        — ClickHouse driver wrapper, batch insert, schema migration
  internal/collector/         — goflow2 UDP listener, sampling normalization, batch flusher
  internal/api/server.go      — All 5 REST endpoints (status, prefixes/tree, interfaces, traffic/overview, traffic/asn-flow)
  config.yaml                 — ISP prefixes, interface mappings, env defaults (edit for your setup)
  migrations/001_initial_schema.sql — ClickHouse DDL reference
  docker-compose.yml          — ClickHouse + collector + api containers
  Dockerfile.collector / Dockerfile.api

frontend/
  src/data/mock.ts            — All hardcoded mock data; replace with API calls when backend is live
  src/components/             — Header, PrefixSidebar, InterfaceSidebar, TrafficOverview, SankeyFlow
```

## 5. Developer Commands

```bash
# Backend (Go 1.27+, installed via brew)
cd backend
go build ./...                  # verify all packages compile
go build -o collector ./cmd/collector
go build -o api ./cmd/api

# Docker stack (ClickHouse + collector + api)
docker compose up -d

# Frontend (Node 18+)
cd frontend
npm install
npm run dev                     # http://localhost:5173
npm run build                   # production dist/
```

## 6. Key Operational Notes

* **`config.yaml` is the single source of truth** for ISP prefixes and interface mappings. The `(router_ip, ifindex)` pairs must match what `ng_netflow` exports. If `ifindex` shifts after router reboot, update `config.yaml`.
* **MaxMind `GeoLite2-ASN.mmdb`** must be manually downloaded (requires free MaxMind account) and placed at the path in `config.yaml` (`/etc/geoip/GeoLite2-ASN.mmdb` by default). Without it, ASN fields are `0` but flows still ingest.
* **goflow2 v2 API** (`github.com/netsampler/goflow2/v2 v2.2.6`): uses `UDPReceiver` + `NewNetFlowPipe` + `protoproducer.ProtoProducerConfig.Compile()`. Do not use the pre-v2 `StateNetFlowProducer` API — it does not exist in v2.
* **ClickHouse schema migration** runs automatically on collector startup via `ch.Migrate(ctx)`. The `IF NOT EXISTS` guards make it safe to re-run.
* **Frontend is not connected to backend yet.** All dashboard data comes from `frontend/src/data/mock.ts`. Future step: replace with `fetch()` calls to `http://localhost:8080/api/v1/...`.

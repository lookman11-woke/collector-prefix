# collector-prefix

High-performance ISP prefix and upstream usage collector dashboard.

`collector-prefix` is an end-to-end network telemetry ingestion, aggregation, and analytics platform designed for Internet Service Providers (ISPs) and network operators running FreeBSD edge routers with BIRD (BGP). It captures sampled NetFlow v9 / IPFIX records from 10Gbps+ links, enriches flows with Autonomous System Numbers (ASNs) and hierarchical ISP prefix tags, persists aggregated time-series in ClickHouse, and serves interactive visualization dashboards with Apache ECharts.

---

## 1. Architecture Overview

```
                                 ┌─────────────────────────────┐
                                 │      FreeBSD Router(s)      │
                                 │  - 10G Transit & IX Ifaces  │
                                 │  - ng_netflow (1:1000)      │
                                 └──────────────┬──────────────┘
                                                │ NetFlow v9 / IPFIX (UDP :2055)
                                                ▼
                                 ┌─────────────────────────────┐
                                 │     Collector Service       │
                                 │  - goflow2 Ingestion Engine │
                                 │  - MaxMind GeoLite2 ASN MMDB│
                                 │  - LPM Prefix & Iface Map   │
                                 │  - 1000x Sample Normalizer  │
                                 └──────────────┬──────────────┘
                                                │ Native Columnar Batch Insert
                                                ▼
                                 ┌─────────────────────────────┐
                                 │     ClickHouse Database     │
                                 │  - flows_raw (7d TTL)       │
                                 │  - flows_1m_by_prefix (30d) │
                                 │  - flows_5m_asn_matrix (1y) │
                                 └──────────────┬──────────────┘
                                                │ Sub-second Aggregations
                                                ▼
                                 ┌─────────────────────────────┐
                                 │       Go REST API (:8080)   │
                                 │  - Prefix Tree Aggregation  │
                                 │  - BPS & PPS Time-Series    │
                                 │  - Sankey ASN Flow Matrix   │
                                 │  - ASN Explorer Deep-Dive   │
                                 │  - CORS & SQL Hardening     │
                                 └──────────────┬──────────────┘
                                                │ JSON / REST
                                                ▼
                                 ┌─────────────────────────────┐
                                 │    Nginx Frontend (:80)     │
                                 │  - React 18 + TypeScript    │
                                 │  - Studio & ASN Explorer    │
                                 │  - Apache ECharts Dark Theme│
                                 │  - Reverse Proxy to /api/   │
                                 └─────────────────────────────┘
```

---

## 2. Key Capabilities

- **Modern Observability Studio Layout:** Full-width 100% data canvas replacing rigid sidebars with sleek top command & filter popovers (`Prefixes ▾`, `Interfaces ▾`) and a high-density KPI telemetry ribbon.
- **Dedicated ASN Explorer View:** Search any remote ASN (e.g. Google, Meta, Cloudflare, Akamai) to view an interface-differentiated stacked area chart with static, deterministic color palettes (Transit in Crimson Red, IX in Amber Gold) and local `/24` subnet impact tables.
- **Hierarchical Prefix Rollup:** Automatically maps individual `/24` or customer subnets into parent `/20`–`/23` CIDR blocks with realtime inbound and outbound traffic calculations.
- **Transit & IX Interface Breakdown:** Segments traffic across transit providers (e.g. `IPT.CBN`, `IPT.iFORTE`) and Internet Exchanges (e.g. `LC.IIX`, `LC.JKT-IX`, `LC.OIXP`).
- **Realtime ASN Flow Sankey:** Visualizes end-to-end flow from external Source ASNs through local ISP ASNs to Upstream Transits and Destination ASNs.
- **Metric Fidelity:** Realtime bandwidth (`bps`, `Kbps`, `Mbps`, `Gbps`) and true packet rates (`pps`, `kpps`, `Mpps`) derived directly from normalized flow telemetry.
- **Line-Rate Ingestion:** Designed for 10Gbps+ edge links with 1:1000 kernel-level sampling, normalized upon ingestion.
- **Production & Security Hardened:** No leaked internal daemon/database engine names in UI, SQL injection parameterized queries, and sanitized identifier whitelisting.

---

## 3. Tech Stack & Prerequisites

- **Backend:** Go 1.22+ (tested on Go 1.27)
- **Frontend:** Node.js 20+, React 18, TypeScript, Tailwind CSS, Vite, Apache ECharts, Nginx
- **Storage:** ClickHouse 24.8+ (native port `9000`, HTTP port `8123`)
- **Enrichment Database:** MaxMind GeoLite2 ASN (`GeoLite2-ASN.mmdb`)
- **Containers:** Docker & Docker Compose

---

## 4. Configuration

The configuration file defines your locally-owned ASNs, IP prefix hierarchy, and interface mapping.

### 4.1 Creating `config.yaml`

Copy the provided template:

```bash
cp config.example.yaml config.yaml
```

### 4.2 Configuration Structure

```yaml
collector:
  listen_addr: "0.0.0.0:2055"
  sampling_rate: 1000            # Matches ng_netflow 1:1000 sampling
  maxmind_path: "/etc/geoip/GeoLite2-ASN.mmdb"
  batch_size: 25000              # Rows per ClickHouse batch
  batch_max_wait_ms: 1000        # Flush interval (ms)

clickhouse:
  addr: "127.0.0.1:9000"
  database: "collector_db"
  user: "default"
  password: ""                   # Can be set via CLICKHOUSE_PASSWORD env var

api:
  listen_addr: "0.0.0.0:8080"
  version: "v0.1.0"

asns:
  - asn: "AS59278"
    name: "Primary ISP Network"
    prefixes:
      - cidr: "103.58.160.0/22"
        children:
          - cidr: "103.58.160.0/24"
          - cidr: "103.58.161.0/24"

interfaces:
  - router_ip: "103.184.64.74"
    ifindex: 10
    name: "IPT.CBN"
    type: "transit"
  - router_ip: "103.184.64.74"
    ifindex: 11
    name: "IX.JKT-IX@JK2"
    type: "ix"

custom_asns:
  - cidr: "10.0.0.0/8"
    asn: 0
    name: "Private Network (10.0.0.0/8)"
```

### 4.3 Environment Variable Overrides

Any setting in `config.yaml` can be overridden via environment variables:

| Environment Variable | Description | Default |
|---|---|---|
| `CLICKHOUSE_ADDR` | ClickHouse native TCP address | `127.0.0.1:9000` (or `clickhouse:9000` in Docker) |
| `CLICKHOUSE_DATABASE` / `CLICKHOUSE_DB` | ClickHouse database name | `collector_db` |
| `CLICKHOUSE_USER` | ClickHouse username | `default` |
| `CLICKHOUSE_PASSWORD` | ClickHouse password | `""` |
| `COLLECTOR_LISTEN_ADDR` | UDP listen address for NetFlow | `0.0.0.0:2055` |
| `SAMPLING_RATE` | Sample scaling factor | `1000` (or `1` if raw) |
| `MAXMIND_ASN_DB_PATH` | Path to `GeoLite2-ASN.mmdb` | `/etc/geoip/GeoLite2-ASN.mmdb` |
| `API_LISTEN_ADDR` | HTTP listen address for REST API | `0.0.0.0:8080` |
| `API_VERSION` | API version reported in `/status` | `v0.1.0` |

### 4.4 MaxMind GeoLite2 ASN Database

Download `GeoLite2-ASN.tar.gz` from your free MaxMind account, extract `GeoLite2-ASN.mmdb`, and place it in the configured path (e.g. `/etc/geoip/GeoLite2-ASN.mmdb` or `backend/GeoLite2-ASN.mmdb`).

---

## 5. FreeBSD `ng_netflow` Configuration

Configure kernel-level flow sampling on your FreeBSD router exporting to the collector:

```sh
# Load kernel module
kldload ng_netflow

# Setup ng_netflow with 1:1000 sampling and export to collector
ngctl -f- <<EOF
mkpeer . eiface hook ether
mkpeer netflow: netflow iface0 lower
name .:iface0 netflow
msg netflow: setconfig { iface=0 conf=1 }
mkpeer netflow: ksocket export inet/dgram/udp
name netflow:export export_node
msg export_node: connect inet/COLLECTOR_IP:2055
EOF
```

---

## 6. Running the Application

### Option A: 100% Fully Containerized with Docker Compose (Recommended)

The complete stack (`clickhouse`, `collector`, `api`, and `frontend` with Nginx reverse proxy) can be deployed with a single command from the project root:

```bash
# 1. Configure your environment
cp config.example.yaml config.yaml
# Edit config.yaml with your router IP, interfaces, and subnets

# 2. Start all services in detached mode
docker compose up -d --build
```

Access the web interface at `http://<your-server-ip>` on port `80` (or configure `PORT=3000 docker compose up -d`).

### Option B: Standalone Binaries (Local Development)

#### 1. Start ClickHouse
Ensure ClickHouse is running locally on port `9000`.

#### 2. Run Database Migrations & Start Collector
```bash
cd backend
go run ./cmd/collector -config ../config.yaml
```

#### 3. Start REST API Server
```bash
cd backend
go run ./cmd/api -config ../config.yaml
```

#### 4. Start Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 7. REST API Reference

All endpoints return JSON and include standard CORS headers (`Access-Control-Allow-Origin: *`). Preflight `OPTIONS` requests return `204 No Content`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/status` | Collector and database operational status, flow ingestion counters, and version |
| `GET` | `/api/v1/asns` | List of locally configured ASNs |
| `GET` | `/api/v1/prefixes/tree` | Hierarchical CIDR tree with realtime inbound/outbound bps |
| `GET` | `/api/v1/interfaces` | Configured upstream transit and IX interface list with active bps |
| `POST` | `/api/v1/traffic/overview` | Time-series traffic series (`bps` or `pps`) with peak/average metrics |
| `POST` | `/api/v1/traffic/asn-flow` | Sankey diagram flow matrix (Source ASN → Local ASN → Transit/Dest ASN) |
| `POST` | `/api/v1/traffic/asn-detail` | ASN Explorer deep-dive: time-series by interface, transit vs IX split, and subnet impact |

### Sample Payload: `/api/v1/traffic/asn-detail`

```json
{
  "asn": "AS15169",
  "time_range": "1h",
  "selected_interfaces": ["IPT.CBN", "LC.OIXP"]
}
```

---

## 8. Building and Testing

### Backend
```bash
cd backend

# Run all unit tests
go test ./... -v

# Compile binaries
go build -o bin/collector ./cmd/collector
go build -o bin/api ./cmd/api
```

### Frontend
```bash
cd frontend

# Linting
npm run lint

# Type-check and build production assets
npm run build
```

---

## 9. License

Internal and proprietary to ISP operations. Refer to repository licensing for details.

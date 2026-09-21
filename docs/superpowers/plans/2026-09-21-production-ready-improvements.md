# Production-Ready Improvements and Git Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `collector-prefix` production-ready and Git-ready by adding CORS/preflight handling, SQL injection hardening, prefix tree filter bug fix, packet metric support, config/secrets hygiene, `.gitignore` setup, root `README.md` documentation, and verifying both Go backend and React frontend build with 0 errors.

**Architecture:** Wrap the Go REST API `http.ServeMux` with a dedicated CORS preflight middleware; sanitize, validate, and parameterize ClickHouse query inputs; ensure prefix queries always enforce exact prefix or expansion matching; add `metric=packets` aggregation to traffic overview; clean config defaults and env overrides with a clean `config.example.yaml`; configure comprehensive `.gitignore`; and document system architecture and deployment in `README.md`.

**Tech Stack:** Go 1.27, ClickHouse (`clickhouse-go/v2`), React 18, TypeScript, Vite, Tailwind CSS, Apache ECharts.

**Spec:** User instructions in prompt and `AGENTS.md` / `PRD.md`.

## Global Constraints

- Backend must compile cleanly with `go build ./...` with zero errors or warnings.
- Frontend must compile cleanly with `npm run build` (`tsc -b && vite build`) with zero errors.
- Do not break existing API response schemas consumed by frontend (`/status`, `/asns`, `/prefixes/tree`, `/interfaces`, `/traffic/overview`, `/traffic/asn-flow`).
- Single source of truth for config remains `config.yaml` with safe fallback in `config.example.yaml`.
- All SQL queries against ClickHouse must be safe against SQL injection attacks.

## Review Focus

1. Preflight `OPTIONS` requests to POST endpoints (`/api/v1/traffic/overview`, `/api/v1/traffic/asn-flow`) must return HTTP 204 with complete CORS headers.
2. In `queryPrefixBps`, an empty prefix expansion or invalid CIDR must never fall back to querying the entire ASN without prefix restriction.
3. SQL injection payloads in `selected_asns`, `selected_prefixes`, or `selected_interfaces` must be safely validated, sanitized, or rejected.
4. `metric=packets` must aggregate `total_packets` and divide by interval seconds to produce packets-per-second (`pps`), while `metric=traffic` aggregates `total_bytes` * 8 / interval seconds to produce `bps`.
5. Sensitive secrets (`config.yaml`, binary files, logs, `GeoLite2-ASN.mmdb`) must be ignored by `.gitignore` without omitting `config.example.yaml`.

---

### Task 1: CORS & Preflight Middleware in API Server

**Files:**
- Modify: `backend/internal/api/server.go`
- Test: `backend/internal/api/server_test.go`

**Interfaces:**
- `corsMiddleware(next http.Handler) http.Handler`: intercepts `OPTIONS` requests, writes 204 No Content with CORS headers, and wraps all other requests with CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`).
- `Server.ServeHTTP(w http.ResponseWriter, r *http.Request)`: delegates to wrapped CORS handler.

- [x] **Step 1: Write the failing test for CORS and preflight handling**

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSPreflight(t *testing.T) {
	s := &Server{mux: http.NewServeMux()}
	s.mux.HandleFunc("POST /api/v1/traffic/overview", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(s.mux)

	// Test OPTIONS preflight
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/traffic/overview", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Content-Type")

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 No Content, got %d", w.Code)
	}
	if origin := w.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected Access-Control-Allow-Origin: *, got %q", origin)
	}
	if methods := w.Header().Get("Access-Control-Allow-Methods"); methods == "" {
		t.Errorf("expected Access-Control-Allow-Methods header, got empty")
	}
	if headers := w.Header().Get("Access-Control-Allow-Headers"); headers == "" {
		t.Errorf("expected Access-Control-Allow-Headers header, got empty")
	}
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api -run TestCORSPreflight -v`
Expected: FAIL ("corsMiddleware undefined")

- [x] **Step 3: Implement CORS middleware in `backend/internal/api/server.go`**

Add `corsMiddleware` function and wrap `s.mux` with `corsMiddleware` in `New()` and store as `s.handler`. Update `s.ServeHTTP` to serve through `s.handler`.

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api -run TestCORSPreflight -v`
Expected: PASS

---

### Task 2: SQL Injection Hardening & Input Sanitization

**Files:**
- Modify: `backend/internal/api/server.go`
- Modify: `backend/internal/clickhouse/client.go`
- Test: `backend/internal/api/validation_test.go`

**Interfaces:**
- `sanitizeASNs(asns []string) []string`: validates ASN format (`^AS?[0-9]{1,10}$`) and filters out invalid or malicious strings.
- `sanitizePrefixes(prefixes []string) []string`: parses CIDRs with `net.ParseCIDR` and filters out non-CIDR strings.
- `sanitizeInterfaces(ifaces []string) []string`: checks interface name format (`^[a-zA-Z0-9._@/-]{1,64}$`).
- `inClause(col string, values []string) string`: whitelists `col`, escapes `\` and `'` for ClickHouse SQL string literals, and returns `AND col IN ('val1', 'val2')`.
- `clickhouse.New`: validates database name identifier against `^[a-zA-Z0-9_]{1,64}$`.

- [x] **Step 1: Write the failing tests for input validation and SQL sanitization**

```go
package api

import (
	"strings"
	"testing"
)

func TestSanitizeASNs(t *testing.T) {
	input := []string{"AS45287", "12345", "AS12345; DROP TABLE flows;", "invalid"}
	sanitized := sanitizeASNs(input)
	if len(sanitized) != 2 {
		t.Fatalf("expected 2 valid ASNs, got %d: %v", len(sanitized), sanitized)
	}
	if sanitized[0] != "AS45287" || sanitized[1] != "AS12345" {
		t.Errorf("unexpected sanitized ASNs: %v", sanitized)
	}
}

func TestSanitizePrefixes(t *testing.T) {
	input := []string{"103.58.160.0/22", "192.168.1.1/32", "not-a-cidr", "103.58.160.0/22' OR 1=1--"}
	sanitized := sanitizePrefixes(input)
	if len(sanitized) != 2 {
		t.Fatalf("expected 2 valid CIDRs, got %d: %v", len(sanitized), sanitized)
	}
}

func TestSanitizeInterfaces(t *testing.T) {
	input := []string{"IPT.CBN", "LC.JKT-IX@JK2", "iface'; DROP TABLE--", "valid_iface-1"}
	sanitized := sanitizeInterfaces(input)
	if len(sanitized) != 3 {
		t.Fatalf("expected 3 valid interfaces, got %d: %v", len(sanitized), sanitized)
	}
}

func TestInClauseHardening(t *testing.T) {
	// Whitelisted column
	c := inClause("isp_asn", []string{"AS1234", "AS5678"})
	if !strings.Contains(c, "AND isp_asn IN ('AS1234', 'AS5678')") {
		t.Errorf("unexpected inClause: %s", c)
	}

	// Non-whitelisted column must be rejected
	cInvalid := inClause("malicious_col; DROP TABLE", []string{"foo"})
	if cInvalid != "" {
		t.Errorf("expected empty clause for invalid column, got %s", cInvalid)
	}

	// Escapes quotes and backslashes
	cEscaped := inClause("isp_prefix", []string{"test'quote\\backslash"})
	if !strings.Contains(cEscaped, "'test\\'quote\\\\backslash'") {
		t.Errorf("expected properly escaped string, got: %s", cEscaped)
	}
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api -run "TestSanitize|TestInClause" -v`
Expected: FAIL

- [x] **Step 3: Implement sanitization functions and column whitelist in `server.go` and `client.go`**

Implement `sanitizeASNs`, `sanitizePrefixes`, `sanitizeInterfaces`, `escapeStringLiteral`, and update `inClause`. In `clickhouse.New`, validate `cfg.Database`. Use sanitized arrays in `handleTrafficOverview` and `handleAsnFlow`.

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api -run "TestSanitize|TestInClause" -v`
Expected: PASS

---

### Task 3: Fix Prefix Tree Filter Bug

**Files:**
- Modify: `backend/internal/api/server.go`
- Test: `backend/internal/api/prefix_test.go`

**Interfaces:**
- `buildPrefixFilterClause(expanded []string, fallbackCIDR string) (clause string, args []any, ok bool)`
- `queryPrefixBps(ctx context.Context, cidr, asnStr, timeRange string)`: always enforces prefix filter; if prefix expansion is empty, uses `cidr` directly; if neither is valid, returns `0, 0` without executing unconstrained query.

- [x] **Step 1: Write the failing test for prefix filter enforcement**

```go
package api

import (
	"testing"
)

func TestBuildPrefixFilterClause(t *testing.T) {
	// Case 1: single expanded prefix
	clause, args, ok := buildPrefixFilterClause([]string{"103.58.160.0/24"}, "103.58.160.0/24")
	if !ok || clause != "AND isp_prefix = ?" || len(args) != 1 || args[0] != "103.58.160.0/24" {
		t.Fatalf("expected single prefix parameter clause, got clause=%q args=%v", clause, args)
	}

	// Case 2: empty expansion must fallback to fallbackCIDR
	clause, args, ok = buildPrefixFilterClause(nil, "103.58.160.0/22")
	if !ok || clause != "AND isp_prefix = ?" || len(args) != 1 || args[0] != "103.58.160.0/22" {
		t.Fatalf("expected fallback to fallbackCIDR, got clause=%q args=%v", clause, args)
	}

	// Case 3: multiple expanded prefixes
	clause, args, ok = buildPrefixFilterClause([]string{"103.58.160.0/24", "103.58.161.0/24"}, "103.58.160.0/22")
	if !ok || clause == "" || len(args) != 0 {
		t.Fatalf("expected IN clause for multiple prefixes, got clause=%q args=%v", clause, args)
	}

	// Case 4: both empty must return ok=false (never query without prefix!)
	clause, args, ok = buildPrefixFilterClause(nil, "")
	if ok {
		t.Fatalf("expected ok=false when both expansion and fallback are empty, got clause=%q", clause)
	}
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api -run TestBuildPrefixFilterClause -v`
Expected: FAIL ("buildPrefixFilterClause undefined")

- [x] **Step 3: Implement `buildPrefixFilterClause` and update `queryPrefixBps`**

In `backend/internal/api/server.go`:
Implement `buildPrefixFilterClause`. In `queryPrefixBps`, use `buildPrefixFilterClause(expanded, cidr)`. If `!ok`, return `0, 0` immediately. If single prefix, use `AND isp_prefix = ?` with parameter argument. If multiple, use sanitized `AND isp_prefix IN (...)`.

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api -run TestBuildPrefixFilterClause -v`
Expected: PASS

---

### Task 4: Traffic Overview Packet Metric Support

**Files:**
- Modify: `backend/internal/api/server.go`
- Test: `backend/internal/api/overview_test.go`

**Interfaces:**
- `buildTrafficOverviewQuery(metric string, intervalSeconds int, db, asnClause, prefixClause, ifaceClause string) string`
- `handleTrafficOverview`: inspects `req.Metric`; if `"packets"`, queries `total_packets` and divides by `intervalSeconds` to produce `pps`.

- [x] **Step 1: Write the failing test for query builder with metric support**

```go
package api

import (
	"strings"
	"testing"
)

func TestBuildTrafficOverviewQuery(t *testing.T) {
	// Test metric=traffic (bps calculation: bytes * 8 / interval)
	qBps := buildTrafficOverviewQuery("traffic", 60, "collector_db", "", "", "")
	if !strings.Contains(qBps, "sumIf(total_bytes, is_inbound = 1) * 8 / 60") {
		t.Errorf("expected total_bytes * 8 / 60 in traffic query, got:\n%s", qBps)
	}

	// Test metric=packets (pps calculation: packets / interval)
	qPps := buildTrafficOverviewQuery("packets", 60, "collector_db", "", "", "")
	if !strings.Contains(qPps, "sumIf(total_packets, is_inbound = 1) / 60") {
		t.Errorf("expected total_packets / 60 in packets query, got:\n%s", qPps)
	}
	if strings.Contains(qPps, "total_bytes") {
		t.Errorf("packets query should not aggregate total_bytes")
	}
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api -run TestBuildTrafficOverviewQuery -v`
Expected: FAIL ("buildTrafficOverviewQuery undefined")

- [x] **Step 3: Implement `buildTrafficOverviewQuery` and integrate into `handleTrafficOverview`**

In `backend/internal/api/server.go`:
Define `buildTrafficOverviewQuery` and call it from `handleTrafficOverview`.

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api -run TestBuildTrafficOverviewQuery -v`
Expected: PASS

---

### Task 5: Config & Secrets Hygiene

**Files:**
- Modify: `backend/internal/config/config.go`
- Create: `backend/config.example.yaml`
- Test: `backend/internal/config/config_test.go`

**Interfaces:**
- `applyEnvOverrides`: supports `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_USER`, `CLICKHOUSE_DATABASE` / `CLICKHOUSE_DB`, `CLICKHOUSE_ADDR`, `API_VERSION`.
- `setDefaults`: sets clean defaults without requiring a hardcoded password.
- `backend/config.example.yaml`: template with safe defaults, relative/container paths, and documentation.

- [x] **Step 1: Write test for config env overrides and password defaults**

```go
package config

import (
	"os"
	"testing"
)

func TestConfigEnvOverrides(t *testing.T) {
	os.Setenv("CLICKHOUSE_PASSWORD", "secret123")
	os.Setenv("CLICKHOUSE_DATABASE", "custom_db")
	defer os.Unsetenv("CLICKHOUSE_PASSWORD")
	defer os.Unsetenv("CLICKHOUSE_DATABASE")

	var cfg Config
	applyEnvOverrides(&cfg)
	setDefaults(&cfg)

	if cfg.ClickHouse.Password != "secret123" {
		t.Errorf("expected password override 'secret123', got %q", cfg.ClickHouse.Password)
	}
	if cfg.ClickHouse.Database != "custom_db" {
		t.Errorf("expected database override 'custom_db', got %q", cfg.ClickHouse.Database)
	}
}

func TestConfigPasswordDefault(t *testing.T) {
	var cfg Config
	setDefaults(&cfg)

	if cfg.ClickHouse.Password != "" {
		t.Errorf("expected empty default password, got %q", cfg.ClickHouse.Password)
	}
	if cfg.ClickHouse.User != "default" {
		t.Errorf("expected default user 'default', got %q", cfg.ClickHouse.User)
	}
}
```

- [x] **Step 2: Run test to verify it passes or fails**

Run: `go test ./internal/config -v`

- [x] **Step 3: Update `backend/internal/config/config.go` and create `backend/config.example.yaml`**

Ensure `CLICKHOUSE_DATABASE` and `CLICKHOUSE_PASSWORD` work cleanly. Create `backend/config.example.yaml` with clear comments, empty password, and relative/container paths.

- [x] **Step 4: Run test to verify it passes**

Run: `go test ./internal/config -v`
Expected: PASS

---

### Task 6: Gitignore Setup

**Files:**
- Create: `.gitignore` (project root)
- Test: verify files to be excluded

- [x] **Step 1: Create root `.gitignore`**

Include:
- `config.yaml` and `backend/config.yaml` while allowing `!config.example.yaml` and `!backend/config.example.yaml`
- `*.mmdb` (MaxMind GeoLite2 databases)
- `*.log` (collector.log, api.log)
- Compiled binaries (`collector`, `api`, `generator`, `backend/collector`, `backend/api`, `backend/generator`, `bin/`)
- OS files (`.DS_Store`, `Thumbs.db`)
- Node / Frontend (`frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/`, `node_modules/`, `dist/`)

- [x] **Step 2: Verify gitignore coverage**

Run: check that existing logs, binaries, and mmdb files are ignored.

---

### Task 7: Comprehensive README.md Documentation

**Files:**
- Create: `README.md` (project root)

- [x] **Step 1: Write comprehensive `README.md`**

Cover:
- Project title & purpose: High-performance ISP prefix and upstream usage collector dashboard.
- System Architecture diagram & flow: FreeBSD `ng_netflow` -> Collector (UDP :2055) -> ClickHouse Columnar DB -> Go REST API -> React UI.
- Configuration Guide:
  - Setting up `config.yaml` from `config.example.yaml`
  - MaxMind GeoLite2 ASN MMDB download & path
  - Interface mappings and prefix hierarchy
  - Environment variable overrides table
- Deployment options:
  - Full Docker Compose stack (`docker compose up -d`)
  - Standalone binary deployment (Go collector + API + Vite build)
- API Endpoint reference table & schemas
- Verification & troubleshooting steps.

---

### Task 8: Verification & Compilation

**Files:**
- Test all backend packages: `cd backend && go test ./... -v`
- Build backend binaries: `cd backend && go build ./...`
- Build frontend: `cd frontend && npm run build`

- [x] **Step 1: Run all backend tests**
Run: `go test ./...` in `backend`
Expected: All tests pass.

- [x] **Step 2: Verify backend build**
Run: `go build ./...` in `backend`
Expected: Compiles with 0 errors.

- [x] **Step 3: Verify frontend build**
Run: `npm run build` in `frontend`
Expected: Compiles with 0 errors.

package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSPreflight(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/traffic/overview", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := corsMiddleware(mux)

	// Preflight OPTIONS request
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/traffic/overview", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "Content-Type")

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected status 204 No Content for preflight, got %d", w.Code)
	}

	if origin := w.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got %q", origin)
	}

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if methods == "" {
		t.Errorf("expected Access-Control-Allow-Methods header to be set")
	}

	headers := w.Header().Get("Access-Control-Allow-Headers")
	if headers == "" {
		t.Errorf("expected Access-Control-Allow-Headers header to be set")
	}
}

func TestCORSNormalRequest(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	handler := corsMiddleware(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", w.Code)
	}

	if origin := w.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got %q", origin)
	}
}

func TestAsnDetailValidation(t *testing.T) {
	s := &Server{mux: http.NewServeMux()}
	s.routes()

	// Test with invalid ASN
	req := httptest.NewRequest(http.MethodPost, "/api/v1/traffic/asn-detail", strings.NewReader(`{"asn":"invalid-asn"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid ASN, got %d", w.Code)
	}

	// Test with empty body
	reqEmpty := httptest.NewRequest(http.MethodPost, "/api/v1/traffic/asn-detail", strings.NewReader(`{}`))
	reqEmpty.Header.Set("Content-Type", "application/json")
	wEmpty := httptest.NewRecorder()
	s.ServeHTTP(wEmpty, reqEmpty)

	if wEmpty.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for empty ASN, got %d", wEmpty.Code)
	}

	// Test with valid ASN when DB is nil (returns empty structure with 200 OK)
	reqValid := httptest.NewRequest(http.MethodPost, "/api/v1/traffic/asn-detail", strings.NewReader(`{"asn":"AS15169","time_range":"1h"}`))
	reqValid.Header.Set("Content-Type", "application/json")
	wValid := httptest.NewRecorder()
	s.ServeHTTP(wValid, reqValid)

	if wValid.Code != http.StatusOK {
		t.Fatalf("expected status 200 for valid ASN, got %d", wValid.Code)
	}

	var resp asnDetailResponse
	if err := json.NewDecoder(wValid.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.ASN != "AS15169" {
		t.Errorf("expected ASN 'AS15169', got %q", resp.ASN)
	}
	if resp.Series == nil {
		t.Errorf("expected non-nil series array")
	}
	if resp.Subnets == nil {
		t.Errorf("expected non-nil subnets array")
	}
}

func TestInterfaceReportHandler(t *testing.T) {
	s := &Server{mux: http.NewServeMux()}
	s.routes()

	// 1. Invalid JSON body -> 400 Bad Request
	reqInvalid := httptest.NewRequest(http.MethodPost, "/api/v1/reports/interfaces", strings.NewReader(`{invalid json`))
	reqInvalid.Header.Set("Content-Type", "application/json")
	wInvalid := httptest.NewRecorder()
	s.ServeHTTP(wInvalid, reqInvalid)
	if wInvalid.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid JSON, got %d", wInvalid.Code)
	}

	// 2. Empty/default request when DB is nil -> 200 OK with mock/fallback structures
	reqDefault := httptest.NewRequest(http.MethodPost, "/api/v1/reports/interfaces", strings.NewReader(`{"time_range":"24h"}`))
	reqDefault.Header.Set("Content-Type", "application/json")
	wDefault := httptest.NewRecorder()
	s.ServeHTTP(wDefault, reqDefault)
	if wDefault.Code != http.StatusOK {
		t.Fatalf("expected status 200 for default request with nil DB, got %d: %s", wDefault.Code, wDefault.Body.String())
	}

	var resp interfaceReportResponse
	if err := json.NewDecoder(wDefault.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.TimeRange != "24h" {
		t.Errorf("expected time_range '24h', got %q", resp.TimeRange)
	}
	if resp.StartTime == "" || resp.EndTime == "" {
		t.Errorf("expected non-empty start_time and end_time, got start=%q end=%q", resp.StartTime, resp.EndTime)
	}
	if len(resp.Reports) == 0 {
		t.Errorf("expected at least 1 interface report in fallback")
	}

	// 3. Filtered request by interface
	reqFiltered := httptest.NewRequest(http.MethodPost, "/api/v1/reports/interfaces", strings.NewReader(`{"time_range":"7d","interfaces":["IPT.CBN"]}`))
	reqFiltered.Header.Set("Content-Type", "application/json")
	wFiltered := httptest.NewRecorder()
	s.ServeHTTP(wFiltered, reqFiltered)
	if wFiltered.Code != http.StatusOK {
		t.Fatalf("expected status 200 for filtered request, got %d", wFiltered.Code)
	}

	var respFiltered interfaceReportResponse
	if err := json.NewDecoder(wFiltered.Body).Decode(&respFiltered); err != nil {
		t.Fatalf("failed to decode filtered response: %v", err)
	}
	if len(respFiltered.Reports) != 1 {
		t.Fatalf("expected 1 interface report, got %d", len(respFiltered.Reports))
	}
	if respFiltered.Reports[0].InterfaceName != "IPT.CBN" {
		t.Errorf("expected interface_name 'IPT.CBN', got %q", respFiltered.Reports[0].InterfaceName)
	}
	if respFiltered.Reports[0].Type != "transit" {
		t.Errorf("expected type 'transit', got %q", respFiltered.Reports[0].Type)
	}
}


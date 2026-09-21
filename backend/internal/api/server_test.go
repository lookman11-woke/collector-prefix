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


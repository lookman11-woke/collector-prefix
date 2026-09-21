// cmd/api is the REST API service for the collector-prefix dashboard.
// It serves the 5 endpoints defined in PRD section 4 against ClickHouse.
package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/collector-prefix/backend/internal/api"
	"github.com/collector-prefix/backend/internal/clickhouse"
	"github.com/collector-prefix/backend/internal/config"
	"github.com/collector-prefix/backend/internal/enricher"
)

func main() {
	cfgPath := flag.String("config", "config.yaml", "path to config.yaml")
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

	// Stub stats counters; in a combined deployment the collector shares these.
	stats := &api.IngestStats{
		FlowsReceived:  new(atomic.Uint64),
		FlowsInserted:  new(atomic.Uint64),
		BatchesSent:    new(atomic.Uint64),
		InsertErrors:   new(atomic.Uint64),
		LastInsertTime: new(atomic.Int64),
		StartTime:      time.Now(),
	}

	srv := api.New(cfg, ch, enc, stats)

	httpServer := &http.Server{
		Addr:         cfg.API.ListenAddr,
		Handler:      withLogging(srv),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		slog.Info("api: shutting down")
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutCtx)
	}()

	slog.Info("api: listening", "addr", cfg.API.ListenAddr, "version", cfg.API.Version)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("api: serve", "err", err)
		os.Exit(1)
	}

	slog.Info("api exited cleanly")
}

// withLogging wraps every request with structured access log output.
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		slog.Info("api",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

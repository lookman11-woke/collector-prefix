// cmd/collector is the NetFlow ingestion service.
// It listens for UDP NetFlow v9/IPFIX datagrams from ng_netflow,
// enriches flows, and bulk-inserts them into ClickHouse.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/collector-prefix/backend/internal/clickhouse"
	"github.com/collector-prefix/backend/internal/collector"
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

	// Open ClickHouse and run schema migrations
	ch, err := clickhouse.New(&cfg.ClickHouse)
	if err != nil {
		slog.Error("clickhouse connect", "err", err)
		os.Exit(1)
	}
	defer ch.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	if err := ch.Migrate(ctx); err != nil {
		cancel()
		slog.Error("clickhouse migrate", "err", err)
		os.Exit(1)
	}
	cancel()

	// Build enricher
	enc, err := enricher.New(cfg)
	if err != nil {
		slog.Error("enricher init", "err", err)
		os.Exit(1)
	}
	defer enc.Close()

	// Shared stats counters
	stats := &collector.Stats{}

	// Start collector
	coll := collector.New(cfg, enc, ch, stats)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	slog.Info("collector starting",
		"listen", cfg.Collector.ListenAddr,
		"sampling_rate", cfg.Collector.SamplingRate,
		"batch_size", cfg.Collector.BatchSize,
	)

	if err := coll.Run(ctx); err != nil && err != context.Canceled {
		slog.Error("collector stopped", "err", err)
		os.Exit(1)
	}

	// Ensure atomic fields are referenced to satisfy compiler
	_ = atomic.Uint64{}

	slog.Info("collector exited cleanly")
}

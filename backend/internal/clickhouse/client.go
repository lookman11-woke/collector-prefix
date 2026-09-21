package clickhouse

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/collector-prefix/backend/internal/config"
)

// Client is a thin wrapper around a ClickHouse connection.
type Client struct {
	conn driver.Conn
	db   string
}

// FlowRow is a single enriched flow record ready for insertion.
// isp_asn is the owning local ASN (e.g. "AS45287") determined by LPM.
type FlowRow struct {
	Timestamp     time.Time
	RouterID      string
	InIface       uint32
	OutIface      uint32
	InterfaceName string
	SrcIP         net.IP // net.IP is directly supported by clickhouse-go v2 IPv4 columns
	DstIP         net.IP
	SrcASN        uint32
	DstASN        uint32
	Proto         uint8
	Bytes         uint64
	Packets       uint64
	IsInbound     uint8
	ISPPrefix     string
	ISPASN        string
}

// isValidDBIdentifier validates that a database name contains only safe alphanumeric and underscore characters.
func isValidDBIdentifier(db string) bool {
	if len(db) == 0 || len(db) > 64 {
		return false
	}
	for _, r := range db {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '_' {
			return false
		}
	}
	return true
}

// New opens a ClickHouse native connection using the supplied config.
func New(cfg *config.ClickHouseConfig) (*Client, error) {
	if !isValidDBIdentifier(cfg.Database) {
		return nil, fmt.Errorf("clickhouse: invalid database name: %q", cfg.Database)
	}

	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.Addr},
		Auth: clickhouse.Auth{
			Database: cfg.Database,
			Username: cfg.User,
			Password: cfg.Password,
		},
		DialTimeout:  10 * time.Second,
		MaxOpenConns: 8,
		MaxIdleConns: 4,
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse: open: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := conn.Ping(ctx); err != nil {
		return nil, fmt.Errorf("clickhouse: ping: %w", err)
	}

	return &Client{conn: conn, db: cfg.Database}, nil
}

// Close shuts down the connection pool.
func (c *Client) Close() error {
	return c.conn.Close()
}

// Ping verifies the connection is alive.
func (c *Client) Ping(ctx context.Context) error {
	return c.conn.Ping(ctx)
}

// InsertFlows performs a bulk insert of FlowRow records into flows_raw.
func (c *Client) InsertFlows(ctx context.Context, rows []FlowRow) error {
	if len(rows) == 0 {
		return nil
	}

	batch, err := c.conn.PrepareBatch(ctx,
		fmt.Sprintf("INSERT INTO %s.flows_raw", c.db))
	if err != nil {
		return fmt.Errorf("clickhouse: prepare batch: %w", err)
	}

	for _, r := range rows {
		if err := batch.Append(
			r.Timestamp,
			r.RouterID,
			r.InIface,
			r.OutIface,
			r.InterfaceName,
			r.SrcIP,
			r.DstIP,
			r.SrcASN,
			r.DstASN,
			r.Proto,
			r.Bytes,
			r.Packets,
			r.IsInbound,
			r.ISPPrefix,
			r.ISPASN,
		); err != nil {
			return fmt.Errorf("clickhouse: append row: %w", err)
		}
	}

	if err := batch.Send(); err != nil {
		return fmt.Errorf("clickhouse: send batch: %w", err)
	}
	return nil
}

// QueryRow executes a single-row query and scans into dest pointers.
func (c *Client) QueryRow(ctx context.Context, query string, args ...any) driver.Row {
	return c.conn.QueryRow(ctx, query, args...)
}

// Query executes a multi-row query.
func (c *Client) Query(ctx context.Context, query string, args ...any) (driver.Rows, error) {
	return c.conn.Query(ctx, query, args...)
}

// Exec runs a non-SELECT statement (DDL, etc.).
func (c *Client) Exec(ctx context.Context, query string, args ...any) error {
	return c.conn.Exec(ctx, query, args...)
}

// DB returns the configured database name.
func (c *Client) DB() string {
	return c.db
}

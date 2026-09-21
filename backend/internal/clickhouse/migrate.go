package clickhouse

import (
	"context"
	"fmt"
)

// Migrate applies the embedded DDL to create or update tables and
// materialized views. Safe to call on every startup (IF NOT EXISTS guards).
// isp_asn is included in all tables so traffic can be filtered per owning ASN.
func (c *Client) Migrate(ctx context.Context) error {
	stmts := []string{
		fmt.Sprintf(`CREATE DATABASE IF NOT EXISTS %s`, c.db),

		// Drop and recreate MVs if schema changed (idempotent via IF NOT EXISTS on targets)
		// flows_raw: primary raw flow storage, 7-day TTL
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.flows_raw (
    timestamp      DateTime     CODEC(DoubleDelta, LZ4),
    router_id      LowCardinality(String),
    in_iface       UInt32,
    out_iface      UInt32,
    interface_name LowCardinality(String),
    src_ip         IPv4,
    dst_ip         IPv4,
    src_asn        UInt32,
    dst_asn        UInt32,
    proto          UInt8,
    bytes          UInt64,
    packets        UInt64,
    is_inbound     UInt8,
    isp_prefix     LowCardinality(String),
    isp_asn        LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (isp_asn, is_inbound, interface_name, isp_prefix, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192`, c.db),

		// 1-minute aggregation target, 30-day TTL
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.flows_1m_by_prefix_and_iface (
    time_bucket    DateTime,
    interface_name LowCardinality(String),
    isp_prefix     LowCardinality(String),
    isp_asn        LowCardinality(String),
    is_inbound     UInt8,
    total_bytes    SimpleAggregateFunction(sum, UInt64),
    total_packets  SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toDate(time_bucket)
ORDER BY (isp_asn, is_inbound, interface_name, isp_prefix, time_bucket)
TTL time_bucket + INTERVAL 30 DAY
SETTINGS index_granularity = 8192`, c.db),

		fmt.Sprintf(`CREATE MATERIALIZED VIEW IF NOT EXISTS %s.mv_flows_1m_by_prefix_and_iface
TO %s.flows_1m_by_prefix_and_iface AS
SELECT
    toStartOfInterval(timestamp, INTERVAL 1 MINUTE) AS time_bucket,
    interface_name,
    isp_prefix,
    isp_asn,
    is_inbound,
    sum(bytes)   AS total_bytes,
    sum(packets) AS total_packets
FROM %s.flows_raw
GROUP BY time_bucket, interface_name, isp_prefix, isp_asn, is_inbound`, c.db, c.db, c.db),

		// 5-minute ASN flow matrix, 1-year TTL
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.flows_5m_asn_matrix (
    time_bucket    DateTime,
    interface_name LowCardinality(String),
    src_asn        UInt32,
    dst_asn        UInt32,
    isp_prefix     LowCardinality(String),
    isp_asn        LowCardinality(String),
    is_inbound     UInt8,
    total_bytes    SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toDate(time_bucket)
ORDER BY (isp_asn, is_inbound, interface_name, src_asn, dst_asn, time_bucket)
TTL time_bucket + INTERVAL 365 DAY
SETTINGS index_granularity = 8192`, c.db),

		fmt.Sprintf(`CREATE MATERIALIZED VIEW IF NOT EXISTS %s.mv_flows_5m_asn_matrix
TO %s.flows_5m_asn_matrix AS
SELECT
    toStartOfInterval(timestamp, INTERVAL 5 MINUTE) AS time_bucket,
    interface_name,
    src_asn,
    dst_asn,
    isp_prefix,
    isp_asn,
    is_inbound,
    sum(bytes) AS total_bytes
FROM %s.flows_raw
GROUP BY time_bucket, interface_name, src_asn, dst_asn, isp_prefix, isp_asn, is_inbound`,
			c.db, c.db, c.db),
	}

	for _, stmt := range stmts {
		if err := c.conn.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("clickhouse: migrate: %w\nStatement:\n%s", err, stmt)
		}
	}
	return nil
}

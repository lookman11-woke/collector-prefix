-- ClickHouse DDL migrations for collector-prefix
-- Run these in order against your ClickHouse instance.
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.

-- 1. Create database
CREATE DATABASE IF NOT EXISTS collector_db;

-- 2. Raw flows table (7-day TTL, partitioned by day)
CREATE TABLE IF NOT EXISTS collector_db.flows_raw (
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
    isp_prefix     LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toDate(timestamp)
ORDER BY (is_inbound, interface_name, isp_prefix, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

-- 3. 1-minute aggregation target table (30-day TTL)
CREATE TABLE IF NOT EXISTS collector_db.flows_1m_by_prefix_and_iface (
    time_bucket    DateTime,
    interface_name LowCardinality(String),
    isp_prefix     LowCardinality(String),
    is_inbound     UInt8,
    total_bytes    SimpleAggregateFunction(sum, UInt64),
    total_packets  SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toDate(time_bucket)
ORDER BY (is_inbound, interface_name, isp_prefix, time_bucket)
TTL time_bucket + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- 4. Materialized view feeding 1-minute aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS collector_db.mv_flows_1m_by_prefix_and_iface
TO collector_db.flows_1m_by_prefix_and_iface AS
SELECT
    toStartOfInterval(timestamp, INTERVAL 1 MINUTE) AS time_bucket,
    interface_name,
    isp_prefix,
    is_inbound,
    sum(bytes)   AS total_bytes,
    sum(packets) AS total_packets
FROM collector_db.flows_raw
GROUP BY time_bucket, interface_name, isp_prefix, is_inbound;

-- 5. 5-minute ASN flow matrix target table (1-year TTL)
CREATE TABLE IF NOT EXISTS collector_db.flows_5m_asn_matrix (
    time_bucket    DateTime,
    interface_name LowCardinality(String),
    src_asn        UInt32,
    dst_asn        UInt32,
    isp_prefix     LowCardinality(String),
    is_inbound     UInt8,
    total_bytes    SimpleAggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toDate(time_bucket)
ORDER BY (is_inbound, interface_name, src_asn, dst_asn, time_bucket)
TTL time_bucket + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- 6. Materialized view feeding 5-minute ASN matrix
CREATE MATERIALIZED VIEW IF NOT EXISTS collector_db.mv_flows_5m_asn_matrix
TO collector_db.flows_5m_asn_matrix AS
SELECT
    toStartOfInterval(timestamp, INTERVAL 5 MINUTE) AS time_bucket,
    interface_name,
    src_asn,
    dst_asn,
    isp_prefix,
    is_inbound,
    sum(bytes) AS total_bytes
FROM collector_db.flows_raw
GROUP BY time_bucket, interface_name, src_asn, dst_asn, isp_prefix, is_inbound;

package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config is the root configuration structure loaded from config.yaml
// and optionally overridden by environment variables.
type Config struct {
	Collector  CollectorConfig  `yaml:"collector"`
	ClickHouse ClickHouseConfig `yaml:"clickhouse"`
	API        APIConfig        `yaml:"api"`

	// ASNs defines all locally-owned Autonomous Systems.
	// Each ASN owns a set of IP prefix blocks.
	ASNs []ASNConfig `yaml:"asns"`

	// Interfaces maps (router_ip, ifindex) pairs to upstream names.
	Interfaces []InterfaceConfig `yaml:"interfaces"`

	// CustomASNs allows manual CIDR-to-ASN overrides (e.g. for IX peering subnets or private ranges).
	CustomASNs []CustomASNConfig `yaml:"custom_asns"`
}

// CustomASNConfig maps a specific CIDR range to an ASN and Name override.
type CustomASNConfig struct {
	CIDR string `yaml:"cidr"`
	ASN  uint32 `yaml:"asn"`
	Name string `yaml:"name"`
}

// ASNConfig describes one locally-owned ASN and all its CIDR blocks.
type ASNConfig struct {
	ASN      string         `yaml:"asn"`      // e.g. "AS45287"
	Name     string         `yaml:"name"`     // human-readable label
	Prefixes []PrefixConfig `yaml:"prefixes"` // owned CIDR blocks
}

type CollectorConfig struct {
	ListenAddr   string `yaml:"listen_addr"`
	SamplingRate uint32 `yaml:"sampling_rate"`
	MaxMindPath  string `yaml:"maxmind_path"`
	BatchSize    int    `yaml:"batch_size"`
	BatchMaxWait int    `yaml:"batch_max_wait_ms"`
}

type ClickHouseConfig struct {
	Addr     string `yaml:"addr"`
	Database string `yaml:"database"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
}

type APIConfig struct {
	ListenAddr string `yaml:"listen_addr"`
	Version    string `yaml:"version"`
}

// PrefixConfig is a single ISP CIDR block with optional sub-prefix children.
type PrefixConfig struct {
	CIDR     string         `yaml:"cidr"`
	Children []PrefixConfig `yaml:"children,omitempty"`
}

// InterfaceConfig maps a (router IP + ifIndex) pair to a tag.
type InterfaceConfig struct {
	RouterIP string `yaml:"router_ip"`
	IfIndex  uint32 `yaml:"ifindex"`
	Name     string `yaml:"name"` // e.g. "IPT.CBN"
	Type     string `yaml:"type"` // "transit" | "ix"
}

// AllPrefixes returns a flat list of all PrefixConfig across all ASNs.
func (c *Config) AllPrefixes() []PrefixConfig {
	var out []PrefixConfig
	for _, a := range c.ASNs {
		out = append(out, a.Prefixes...)
	}
	return out
}

// LocalASNStrings returns all configured ASN strings (e.g. ["AS45287", "AS139057"]).
func (c *Config) LocalASNStrings() []string {
	out := make([]string, len(c.ASNs))
	for i, a := range c.ASNs {
		out[i] = a.ASN
	}
	return out
}

// Load reads config.yaml from path and applies environment variable overrides.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("config: read %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("config: parse yaml: %w", err)
	}
	applyEnvOverrides(&cfg)
	setDefaults(&cfg)
	return &cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("COLLECTOR_LISTEN_ADDR"); v != "" {
		cfg.Collector.ListenAddr = v
	}
	if v := os.Getenv("SAMPLING_RATE"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil {
			cfg.Collector.SamplingRate = uint32(n)
		}
	}
	if v := os.Getenv("MAXMIND_ASN_DB_PATH"); v != "" {
		cfg.Collector.MaxMindPath = v
	}
	if v := os.Getenv("CLICKHOUSE_ADDR"); v != "" {
		cfg.ClickHouse.Addr = v
	}
	if v := os.Getenv("CLICKHOUSE_DB"); v != "" {
		cfg.ClickHouse.Database = v
	}
	if v := os.Getenv("CLICKHOUSE_DATABASE"); v != "" {
		cfg.ClickHouse.Database = v
	}
	if v := os.Getenv("CLICKHOUSE_USER"); v != "" {
		cfg.ClickHouse.User = v
	}
	if v := os.Getenv("CLICKHOUSE_PASSWORD"); v != "" {
		cfg.ClickHouse.Password = v
	}
	if v := os.Getenv("API_LISTEN_ADDR"); v != "" {
		cfg.API.ListenAddr = v
	}
	if v := os.Getenv("API_VERSION"); v != "" {
		cfg.API.Version = v
	}
	// LOCAL_ASN (legacy single-ASN env) → inject as first ASN if asns is empty
	if v := os.Getenv("LOCAL_ASN"); v != "" && len(cfg.ASNs) == 0 {
		asn := v
		if !strings.HasPrefix(asn, "AS") {
			asn = "AS" + asn
		}
		cfg.ASNs = []ASNConfig{{ASN: asn, Name: asn}}
	}
}

func setDefaults(cfg *Config) {
	if cfg.Collector.ListenAddr == "" {
		cfg.Collector.ListenAddr = "0.0.0.0:2055"
	}
	if cfg.Collector.SamplingRate == 0 {
		cfg.Collector.SamplingRate = 1
	}
	if cfg.Collector.BatchSize == 0 {
		cfg.Collector.BatchSize = 25000
	}
	if cfg.Collector.BatchMaxWait == 0 {
		cfg.Collector.BatchMaxWait = 1000
	}
	if cfg.ClickHouse.Addr == "" {
		cfg.ClickHouse.Addr = "127.0.0.1:9000"
	}
	if cfg.ClickHouse.Database == "" {
		cfg.ClickHouse.Database = "collector_db"
	}
	if cfg.ClickHouse.User == "" {
		cfg.ClickHouse.User = "default"
	}
	if cfg.API.ListenAddr == "" {
		cfg.API.ListenAddr = "0.0.0.0:8080"
	}
	if cfg.API.Version == "" {
		cfg.API.Version = "v0.1.0"
	}
}

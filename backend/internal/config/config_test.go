package config

import (
	"os"
	"testing"
)

func TestConfigEnvOverrides(t *testing.T) {
	os.Setenv("CLICKHOUSE_PASSWORD", "secret123")
	os.Setenv("CLICKHOUSE_DATABASE", "custom_db")
	os.Setenv("API_VERSION", "v1.2.3")
	defer os.Unsetenv("CLICKHOUSE_PASSWORD")
	defer os.Unsetenv("CLICKHOUSE_DATABASE")
	defer os.Unsetenv("API_VERSION")

	var cfg Config
	applyEnvOverrides(&cfg)
	setDefaults(&cfg)

	if cfg.ClickHouse.Password != "secret123" {
		t.Errorf("expected password override 'secret123', got %q", cfg.ClickHouse.Password)
	}
	if cfg.ClickHouse.Database != "custom_db" {
		t.Errorf("expected database override 'custom_db', got %q", cfg.ClickHouse.Database)
	}
	if cfg.API.Version != "v1.2.3" {
		t.Errorf("expected API version override 'v1.2.3', got %q", cfg.API.Version)
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

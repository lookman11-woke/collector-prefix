package clickhouse

import (
	"strings"
	"testing"

	"github.com/collector-prefix/backend/internal/config"
)

func TestDatabaseIdentifierValidation(t *testing.T) {
	invalidConfigs := []*config.ClickHouseConfig{
		{Database: "db; DROP TABLE flows;"},
		{Database: "invalid name with space"},
		{Database: "db'--"},
		{Database: ""},
	}

	for _, cfg := range invalidConfigs {
		_, err := New(cfg)
		if err == nil || !strings.Contains(err.Error(), "invalid database name") {
			t.Errorf("expected 'invalid database name' error for %q, got %v", cfg.Database, err)
		}
	}
}

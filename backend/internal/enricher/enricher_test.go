package enricher

import (
	"testing"

	"github.com/collector-prefix/backend/internal/config"
)

func TestInterfaceType(t *testing.T) {
	cfg := &config.Config{
		Interfaces: []config.InterfaceConfig{
			{RouterIP: "10.0.0.1", IfIndex: 1, Name: "IPT.CBN", Type: "transit"},
			{RouterIP: "10.0.0.1", IfIndex: 2, Name: "LC.OIXP", Type: "ix"},
			{RouterIP: "10.0.0.1", IfIndex: 3, Name: "IX.JKT-IX@JK2", Type: "ix"},
		},
	}

	enc, err := New(cfg)
	if err != nil {
		t.Fatalf("failed to create enricher: %v", err)
	}

	tests := []struct {
		name     string
		expected string
	}{
		{"IPT.CBN", "transit"},
		{"LC.OIXP", "ix"},
		{"IX.JKT-IX@JK2", "ix"},
		{"IPT.NEW_UPSTREAM", "transit"}, // Fallback based on IPT. prefix
		{"LC.NEW_EXCHANGE", "ix"},       // Fallback based on LC. prefix
		{"IX.NEW_EXCHANGE", "ix"},       // Fallback based on IX. prefix
		{"UNKNOWN_IFACE", "transit"},    // Default fallback
	}

	for _, tc := range tests {
		got := enc.InterfaceType(tc.name)
		if got != tc.expected {
			t.Errorf("InterfaceType(%q) = %q, expected %q", tc.name, got, tc.expected)
		}
	}
}

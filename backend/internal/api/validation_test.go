package api

import (
	"strings"
	"testing"
)

func TestSanitizeASNs(t *testing.T) {
	input := []string{"AS45287", "12345", "as139057", "AS12345; DROP TABLE flows;", "invalid_asn", "AS"}
	sanitized := sanitizeASNs(input)
	if len(sanitized) != 3 {
		t.Fatalf("expected 3 valid ASNs, got %d: %v", len(sanitized), sanitized)
	}
	if sanitized[0] != "AS45287" || sanitized[1] != "AS12345" || sanitized[2] != "AS139057" {
		t.Errorf("unexpected sanitized ASNs: %v", sanitized)
	}
}

func TestSanitizePrefixes(t *testing.T) {
	input := []string{
		"103.58.160.0/22",
		"192.168.1.1/32",
		"10.0.0.1", // bare IP normalized to /32
		"not-a-cidr",
		"103.58.160.0/22' OR 1=1--",
		"; DROP TABLE--",
	}
	sanitized := sanitizePrefixes(input)
	if len(sanitized) != 3 {
		t.Fatalf("expected 3 valid CIDRs, got %d: %v", len(sanitized), sanitized)
	}
	if sanitized[0] != "103.58.160.0/22" || sanitized[1] != "192.168.1.1/32" || sanitized[2] != "10.0.0.1/32" {
		t.Errorf("unexpected sanitized prefixes: %v", sanitized)
	}
}

func TestSanitizeInterfaces(t *testing.T) {
	input := []string{"IPT.CBN", "LC.JKT-IX@JK2", "iface'; DROP TABLE--", "valid_iface-1", "iface with space"}
	sanitized := sanitizeInterfaces(input)
	if len(sanitized) != 3 {
		t.Fatalf("expected 3 valid interfaces, got %d: %v", len(sanitized), sanitized)
	}
	if sanitized[0] != "IPT.CBN" || sanitized[1] != "LC.JKT-IX@JK2" || sanitized[2] != "valid_iface-1" {
		t.Errorf("unexpected sanitized interfaces: %v", sanitized)
	}
}

func TestInClauseHardening(t *testing.T) {
	// Whitelisted column
	c := inClause("isp_asn", []string{"AS1234", "AS5678"})
	if !strings.Contains(c, "AND isp_asn IN ('AS1234', 'AS5678')") {
		t.Errorf("unexpected inClause: %s", c)
	}

	// Non-whitelisted column must return empty clause
	cInvalid := inClause("malicious_col; DROP TABLE", []string{"foo"})
	if cInvalid != "" {
		t.Errorf("expected empty clause for invalid column, got: %q", cInvalid)
	}

	// Empty list returns empty clause
	if inClause("isp_asn", nil) != "" || inClause("isp_asn", []string{}) != "" {
		t.Errorf("expected empty clause for empty values")
	}

	// Escapes quotes and backslashes properly
	cEscaped := inClause("isp_prefix", []string{"test'quote\\backslash"})
	if !strings.Contains(cEscaped, "'test\\'quote\\\\backslash'") {
		t.Errorf("expected properly escaped string in clause, got: %s", cEscaped)
	}
}

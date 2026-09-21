package api

import (
	"testing"
)

func TestBuildPrefixFilterClause(t *testing.T) {
	// Case 1: single expanded prefix
	clause, args, ok := buildPrefixFilterClause([]string{"103.58.160.0/24"}, "103.58.160.0/24")
	if !ok || clause != "AND isp_prefix = ?" || len(args) != 1 || args[0] != "103.58.160.0/24" {
		t.Fatalf("expected single prefix parameter clause, got clause=%q args=%v", clause, args)
	}

	// Case 2: empty expansion must fallback to fallbackCIDR (exact prefix match)
	clause, args, ok = buildPrefixFilterClause(nil, "103.58.160.0/22")
	if !ok || clause != "AND isp_prefix = ?" || len(args) != 1 || args[0] != "103.58.160.0/22" {
		t.Fatalf("expected fallback to fallbackCIDR, got clause=%q args=%v", clause, args)
	}

	// Case 3: multiple expanded prefixes
	clause, args, ok = buildPrefixFilterClause([]string{"103.58.160.0/24", "103.58.161.0/24"}, "103.58.160.0/22")
	if !ok || clause == "" || len(args) != 0 {
		t.Fatalf("expected IN clause for multiple prefixes, got clause=%q args=%v", clause, args)
	}

	// Case 4: both empty must return ok=false (never query without prefix!)
	clause, args, ok = buildPrefixFilterClause(nil, "")
	if ok {
		t.Fatalf("expected ok=false when both expansion and fallback are empty, got clause=%q", clause)
	}

	// Case 5: invalid CIDRs must return ok=false
	clause, args, ok = buildPrefixFilterClause([]string{"not-a-cidr"}, "invalid")
	if ok {
		t.Fatalf("expected ok=false for invalid CIDRs, got clause=%q", clause)
	}
}

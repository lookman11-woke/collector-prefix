package api

import (
	"strings"
	"testing"
)

func TestBuildTrafficOverviewQuery(t *testing.T) {
	// Test metric=traffic (bps calculation: bytes * 8 / interval)
	qBps := buildTrafficOverviewQuery("traffic", 60, "collector_db", "", "", "")
	if !strings.Contains(qBps, "sumIf(total_bytes, is_inbound = 1) * 8 / 60") {
		t.Errorf("expected total_bytes * 8 / 60 in traffic query, got:\n%s", qBps)
	}

	// Test metric=packets (pps calculation: packets / interval)
	qPps := buildTrafficOverviewQuery("packets", 60, "collector_db", "", "", "")
	if !strings.Contains(qPps, "sumIf(total_packets, is_inbound = 1) / 60") {
		t.Errorf("expected total_packets / 60 in packets query, got:\n%s", qPps)
	}
	if strings.Contains(qPps, "total_bytes") {
		t.Errorf("packets query should not aggregate total_bytes")
	}
}

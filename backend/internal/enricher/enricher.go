// Package enricher resolves flow IPs to ASNs via MaxMind GeoLite2-ASN,
// matches source/destination IPs against ISP-owned CIDR prefixes using
// longest-prefix-match (LPM), and maps (routerIP, ifIndex) pairs to
// human-readable interface names.
//
// Multi-ASN: each PrefixEntry now carries the owning ISP ASN string so
// that every enriched flow is tagged with both isp_prefix and isp_asn.
package enricher

import (
	"encoding/binary"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/collector-prefix/backend/internal/config"
	"github.com/oschwald/maxminddb-golang"
)

// ASNRecord is the MaxMind GeoLite2-ASN record shape.
type ASNRecord struct {
	AutonomousSystemNumber       uint32 `maxminddb:"autonomous_system_number"`
	AutonomousSystemOrganization string `maxminddb:"autonomous_system_organization"`
}

type customASNEntry struct {
	network *net.IPNet
	asn     uint32
	name    string
}

// PrefixEntry is a parsed ISP CIDR with its numeric network/mask for LPM
// and the owning ISP ASN string.
type PrefixEntry struct {
	CIDR    string
	ISPASN  string // e.g. "AS45287"
	Network *net.IPNet
	NetAddr uint32
	Mask    uint32
}

// MatchResult is returned by MatchPrefix.
type MatchResult struct {
	CIDR   string
	ISPASN string
}

// IfaceKey uniquely identifies an interface from a flow record.
type IfaceKey struct {
	RouterIP string
	IfIndex  uint32
}

// IfaceInfo is the resolved human-readable interface metadata.
type IfaceInfo struct {
	Name string
	Type string // "transit" | "ix"
}

// ASNSummary is metadata about a single locally-owned ASN.
type ASNSummary struct {
	ASN         string
	Name        string
	PrefixCount int
}

// Enricher holds all lookup state and is safe for concurrent use.
type Enricher struct {
	mu         sync.RWMutex
	mmdb       *maxminddb.Reader
	prefixes   []PrefixEntry // sorted longest-mask first for LPM
	ifaces     map[IfaceKey]IfaceInfo
	asnMeta    []ASNSummary
	asnOrgs    map[uint32]string // ASN -> Organization name cache
	customASNs []customASNEntry
}

// New creates an Enricher from the loaded configuration.
func New(cfg *config.Config) (*Enricher, error) {
	e := &Enricher{
		ifaces:  make(map[IfaceKey]IfaceInfo),
		asnOrgs: make(map[uint32]string),
	}

	if cfg.Collector.MaxMindPath != "" {
		db, err := maxminddb.Open(cfg.Collector.MaxMindPath)
		if err != nil {
			return nil, fmt.Errorf("enricher: open maxmind db: %w", err)
		}
		e.mmdb = db
		e.loadASNIndex()
	}

	// Build prefix table from all ASNs
	e.loadPrefixes(cfg.ASNs)

	// Build interface map
	for _, iface := range cfg.Interfaces {
		key := IfaceKey{RouterIP: iface.RouterIP, IfIndex: iface.IfIndex}
		e.ifaces[key] = IfaceInfo{Name: iface.Name, Type: iface.Type}
	}

	// Store ASN metadata & pre-populate organization names for your local ASNs
	for _, a := range cfg.ASNs {
		count := countPrefixes(a.Prefixes)
		e.asnMeta = append(e.asnMeta, ASNSummary{
			ASN:         a.ASN,
			Name:        a.Name,
			PrefixCount: count,
		})
		if n, err := strconv.ParseUint(strings.TrimPrefix(a.ASN, "AS"), 10, 32); err == nil {
			e.asnOrgs[uint32(n)] = a.Name
		}
	}

	// Load custom ASN overrides
	for _, c := range cfg.CustomASNs {
		if _, ipnet, err := net.ParseCIDR(c.CIDR); err == nil {
			e.customASNs = append(e.customASNs, customASNEntry{
				network: ipnet,
				asn:     c.ASN,
				name:    c.Name,
			})
			if c.Name != "" {
				e.asnOrgs[c.ASN] = c.Name
			}
		}
	}

	return e, nil
}

// loadASNIndex scans the MaxMind MMDB tree at startup and pre-indexes
// all global ASN Numbers to their full Organization Names.
func (e *Enricher) loadASNIndex() {
	if e.mmdb == nil {
		return
	}
	networks := e.mmdb.Networks(maxminddb.SkipAliasedNetworks)
	var rec ASNRecord
	for networks.Next() {
		_, err := networks.Network(&rec)
		if err != nil {
			continue
		}
		if rec.AutonomousSystemNumber > 0 && rec.AutonomousSystemOrganization != "" {
			if _, exists := e.asnOrgs[rec.AutonomousSystemNumber]; !exists {
				e.asnOrgs[rec.AutonomousSystemNumber] = rec.AutonomousSystemOrganization
			}
		}
	}
}

// Close releases the MaxMind database handle.
func (e *Enricher) Close() {
	if e.mmdb != nil {
		_ = e.mmdb.Close()
	}
}

// LookupASN returns the external ASN for the given IP. Returns 0 on miss.
// It also records the organization name into the internal cache for Sankey rendering.
func (e *Enricher) LookupASN(ip net.IP) uint32 {
	// 1. Check custom overrides first
	for _, c := range e.customASNs {
		if c.network.Contains(ip) {
			if c.name != "" {
				e.mu.Lock()
				e.asnOrgs[c.asn] = c.name
				e.mu.Unlock()
			}
			return c.asn
		}
	}

	if e.mmdb == nil {
		if ip.IsPrivate() {
			e.mu.Lock()
			e.asnOrgs[0] = "Private Network (RFC1918)"
			e.mu.Unlock()
		}
		return 0
	}

	var rec ASNRecord
	if err := e.mmdb.Lookup(ip, &rec); err != nil || rec.AutonomousSystemNumber == 0 {
		if ip.IsPrivate() {
			e.mu.Lock()
			e.asnOrgs[0] = "Private Network (RFC1918)"
			e.mu.Unlock()
		}
		return 0
	}

	if rec.AutonomousSystemNumber > 0 && rec.AutonomousSystemOrganization != "" {
		e.mu.Lock()
		if _, ok := e.asnOrgs[rec.AutonomousSystemNumber]; !ok {
			e.asnOrgs[rec.AutonomousSystemNumber] = rec.AutonomousSystemOrganization
		}
		e.mu.Unlock()
	}
	return rec.AutonomousSystemNumber
}

// ASNOrg returns the cached organization name for an ASN number (or empty string).
func (e *Enricher) ASNOrg(asn uint32) string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.asnOrgs[asn]
}

// LocalASNName returns the organization name for a local ASN string (e.g. "AS59278").
func (e *Enricher) LocalASNName(asnStr string) string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	for _, m := range e.asnMeta {
		if m.ASN == asnStr {
			return m.Name
		}
	}
	return ""
}

// MatchPrefix returns the most-specific ISP CIDR and its owning ASN for ip.
// Returns matched=false if ip is not in any ISP-owned block.
func (e *Enricher) MatchPrefix(ip net.IP) (result MatchResult, matched bool) {
	ip4 := ip.To4()
	if ip4 == nil {
		return MatchResult{}, false
	}
	addr := binary.BigEndian.Uint32(ip4)

	e.mu.RLock()
	defer e.mu.RUnlock()

	for _, p := range e.prefixes {
		if addr&p.Mask == p.NetAddr {
			return MatchResult{CIDR: p.CIDR, ISPASN: p.ISPASN}, true
		}
	}
	return MatchResult{}, false
}

// LookupInterface resolves a (routerIP, ifIndex) pair to interface metadata.
// If no exact (routerIP, ifIndex) match exists, it falls back to matching by ifIndex alone.
func (e *Enricher) LookupInterface(routerIP string, ifIndex uint32) (IfaceInfo, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if info, ok := e.ifaces[IfaceKey{RouterIP: routerIP, IfIndex: ifIndex}]; ok {
		return info, true
	}
	// Fallback: match by ifIndex alone
	for k, v := range e.ifaces {
		if k.IfIndex == ifIndex {
			return v, true
		}
	}
	return IfaceInfo{}, false
}

// AllInterfaces returns a deduplicated list of all registered interfaces (by name).
func (e *Enricher) AllInterfaces() []config.InterfaceConfig {
	e.mu.RLock()
	defer e.mu.RUnlock()
	seen := make(map[string]bool)
	var out []config.InterfaceConfig
	for k, v := range e.ifaces {
		if !seen[v.Name] {
			seen[v.Name] = true
			out = append(out, config.InterfaceConfig{
				RouterIP: k.RouterIP,
				IfIndex:  k.IfIndex,
				Name:     v.Name,
				Type:     v.Type,
			})
		}
	}
	return out
}

// InterfaceType returns the interface type ("transit" or "ix") for a given interface name.
func (e *Enricher) InterfaceType(name string) string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	for _, v := range e.ifaces {
		if v.Name == name {
			return v.Type
		}
	}
	// Fallback based on naming conventions
	if strings.HasPrefix(name, "LC.") || strings.HasPrefix(name, "IX.") {
		return "ix"
	}
	return "transit"
}

// AllPrefixCIDRs returns every registered ISP CIDR string (flat).
func (e *Enricher) AllPrefixCIDRs() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]string, len(e.prefixes))
	for i, p := range e.prefixes {
		out[i] = p.CIDR
	}
	return out
}

// ASNMeta returns metadata for all locally-owned ASNs.
func (e *Enricher) ASNMeta() []ASNSummary {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]ASNSummary, len(e.asnMeta))
	copy(out, e.asnMeta)
	return out
}

// ExpandPrefixes expands a list of CIDR strings (which may include parent blocks
// like /20, /22) into all matching sub-prefixes registered under that parent.
// If input is empty, returns empty (no filter).
func (e *Enricher) ExpandPrefixes(cidrs []string) []string {
	if len(cidrs) == 0 {
		return nil
	}
	e.mu.RLock()
	defer e.mu.RUnlock()

	matched := make(map[string]struct{})

	for _, c := range cidrs {
		matched[c] = struct{}{} // always include the exact string

		_, parentNet, err := net.ParseCIDR(c)
		if err != nil {
			continue
		}

		for _, p := range e.prefixes {
			if p.Network != nil && parentNet.Contains(p.Network.IP) {
				matched[p.CIDR] = struct{}{}
			}
		}
	}

	out := make([]string, 0, len(matched))
	for k := range matched {
		out = append(out, k)
	}
	return out
}

// TotalPrefixCount returns the total number of registered ISP prefixes.
func (e *Enricher) TotalPrefixCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return len(e.prefixes)
}

// ── internal helpers ──────────────────────────────────────────────────────────

func (e *Enricher) loadPrefixes(asns []config.ASNConfig) {
	var entries []PrefixEntry

	var walk func(ps []config.PrefixConfig, asnStr string)
	walk = func(ps []config.PrefixConfig, asnStr string) {
		for _, p := range ps {
			_, ipnet, err := net.ParseCIDR(p.CIDR)
			if err != nil {
				continue
			}
			ip4 := ipnet.IP.To4()
			if ip4 == nil {
				continue
			}
			mask := binary.BigEndian.Uint32(ipnet.Mask)
			netAddr := binary.BigEndian.Uint32(ip4)
			entries = append(entries, PrefixEntry{
				CIDR:    p.CIDR,
				ISPASN:  asnStr,
				Network: ipnet,
				NetAddr: netAddr,
				Mask:    mask,
			})
			if len(p.Children) > 0 {
				walk(p.Children, asnStr)
			}
		}
	}

	for _, a := range asns {
		walk(a.Prefixes, a.ASN)
	}

	// Longest mask first → most-specific prefix wins LPM
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Mask > entries[j].Mask
	})

	e.mu.Lock()
	e.prefixes = entries
	e.mu.Unlock()
}

func countPrefixes(ps []config.PrefixConfig) int {
	n := len(ps)
	for _, p := range ps {
		n += countPrefixes(p.Children)
	}
	return n
}

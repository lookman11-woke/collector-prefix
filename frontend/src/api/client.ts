import {
  STATUS,
  MOCK_PREFIX_GROUPS,
  MOCK_ASNS,
  INTERFACES,
  TRAFFIC_SERIES,
  TRAFFIC_SUMMARY,
  ASN_FLOW,
  getMockAsnDetail,
  type PrefixNode,
  type Interface,
  type ASNGroup,
  type ASNPrefixGroup,
  type AsnDetailResponse,
  type AsnDetailSummary,
  type AsnDetailPoint,
  type AsnSubnetImpact,
} from '../data/mock'

// ── Shared types ──────────────────────────────────────────────────────────────

export type {
  PrefixNode,
  Interface,
  ASNGroup,
  ASNPrefixGroup,
  AsnDetailResponse,
  AsnDetailSummary,
  AsnDetailPoint,
  AsnSubnetImpact,
}

export interface SystemStatus {
  version: string
  online: boolean
  uptime_seconds: number
  asn_count: number
  prefix_count: number
  interface_count: number
  flows_received: number
  flows_inserted: number
  insert_errors: number
  last_insert_time: string
  db_status: string
}

export interface ASNsResponse {
  asns: {
    asn: string
    name: string
    prefix_count: number
    inbound_bps: number
    outbound_bps: number
  }[]
}

export interface PrefixTreeResponse {
  total_prefixes: number
  groups: ASNPrefixGroup[]
}

export interface InterfacesResponse {
  interfaces: Interface[]
}

export interface TrafficPoint {
  timestamp: string
  inbound_bps: number
  outbound_bps: number
}

export interface TrafficSummary {
  current_inbound_bps: number
  current_outbound_bps: number
  peak_inbound_bps: number
  peak_outbound_bps: number
  average_inbound_bps: number
  average_outbound_bps: number
}

export interface TrafficOverviewResponse {
  summary: TrafficSummary
  series: TrafficPoint[]
}

export interface SankeyNode {
  name: string
  label?: string
  org?: string
  total?: number
  tier?: string
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface AsnFlowResponse {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

const API_BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ── API calls with mock fallback ──────────────────────────────────────────────

export async function getStatus(): Promise<SystemStatus> {
  const data = await request<SystemStatus>('/status')
  if (data) return data
  return {
    version: STATUS.version,
    online: false,
    uptime_seconds: 0,
    asn_count: STATUS.asnCount,
    prefix_count: STATUS.prefixCount,
    interface_count: INTERFACES.length,
    flows_received: 0,
    flows_inserted: 0,
    insert_errors: 0,
    last_insert_time: STATUS.lastUpdated.toISOString(),
    db_status: 'offline / demo mode',
  }
}

export async function getASNs(): Promise<ASNsResponse> {
  const data = await request<ASNsResponse>('/asns')
  if (data && data.asns && data.asns.length > 0) return data
  return {
    asns: MOCK_ASNS.map((a) => ({
      asn: a.asn,
      name: a.name,
      prefix_count: a.prefix_count,
      inbound_bps: a.inbound_bps,
      outbound_bps: a.outbound_bps,
    })),
  }
}

export async function getPrefixTree(asnFilter?: string): Promise<PrefixTreeResponse> {
  const qs = asnFilter ? `?asn=${encodeURIComponent(asnFilter)}` : ''
  const data = await request<PrefixTreeResponse>(`/prefixes/tree${qs}`)
  if (data && data.groups && data.groups.length > 0) return data
  const groups = asnFilter
    ? MOCK_PREFIX_GROUPS.filter((g) => g.asn === asnFilter)
    : MOCK_PREFIX_GROUPS
  return {
    total_prefixes: groups.reduce((a, g) => a + g.prefix_count, 0),
    groups,
  }
}

export async function getInterfaces(): Promise<InterfacesResponse> {
  const data = await request<InterfacesResponse>('/interfaces')
  if (data && data.interfaces && data.interfaces.length > 0) return data
  return { interfaces: INTERFACES }
}

export interface TrafficOverviewQuery {
  time_range: string
  metric: 'traffic' | 'packets'
  direction: string
  selected_asns: string[]
  selected_prefixes: string[]
  selected_interfaces: string[]
}

export async function getTrafficOverview(query: TrafficOverviewQuery): Promise<TrafficOverviewResponse> {
  const data = await request<TrafficOverviewResponse>('/traffic/overview', {
    method: 'POST',
    body: JSON.stringify(query),
  })
  if (data) {
    return {
      summary: data.summary || {
        current_inbound_bps: 0,
        current_outbound_bps: 0,
        peak_inbound_bps: 0,
        peak_outbound_bps: 0,
        average_inbound_bps: 0,
        average_outbound_bps: 0,
      },
      series: data.series || [],
    }
  }
  return { summary: TRAFFIC_SUMMARY, series: TRAFFIC_SERIES }
}

export interface AsnFlowQuery {
  time_range: string
  selected_asns: string[]
  selected_prefixes: string[]
  selected_interfaces: string[]
  top_n?: number
}

export async function getAsnFlow(query: AsnFlowQuery): Promise<AsnFlowResponse> {
  const data = await request<AsnFlowResponse>('/traffic/asn-flow', {
    method: 'POST',
    body: JSON.stringify(query),
  })
  if (data) {
    return {
      nodes: data.nodes || [],
      links: data.links || [],
    }
  }
  return ASN_FLOW
}

export interface AsnDetailQuery {
  asn: string
  time_range: string
  selected_interfaces?: string[]
}

export async function getAsnDetail(
  query: AsnDetailQuery,
  interfaces: Interface[] = INTERFACES,
  prefixes: string[] = []
): Promise<AsnDetailResponse> {
  const data = await request<AsnDetailResponse>('/traffic/asn-detail', {
    method: 'POST',
    body: JSON.stringify(query),
  })
  if (data && data.asn) {
    return {
      asn: data.asn,
      org: data.org || data.asn,
      summary: data.summary || {
        current_inbound_bps: 0,
        current_outbound_bps: 0,
        peak_inbound_bps: 0,
        peak_outbound_bps: 0,
        total_bps: 0,
        transit_bps: 0,
        ix_bps: 0,
        transit_percent: 0,
        ix_percent: 0,
        active_interfaces: [],
      },
      series: data.series || [],
      subnets: data.subnets || [],
    }
  }
  return getMockAsnDetail(query.asn, query.time_range, interfaces, prefixes)
}


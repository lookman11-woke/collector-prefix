// Mock data matching config.yaml — multi-ASN edition.
// Used as fallback when the Go backend API is not reachable.

export type PrefixNode = {
  cidr: string
  level: number
  inbound_bps: number
  outbound_bps: number
  children?: PrefixNode[]
}

export type Interface = {
  id: string
  name: string
  type: 'transit' | 'ix'
  status: 'up' | 'down'
  current_bps: number
}

export type ASNGroup = {
  asn: string
  name: string
  prefix_count: number
  inbound_bps: number
  outbound_bps: number
}

// ── 5 ASNs from config.yaml ───────────────────────────────────────────────────

export const MOCK_ASNS: ASNGroup[] = [
  { asn: 'AS59278', name: 'Jaringan VNT Indonesia', prefix_count: 10, inbound_bps: 22_500_000, outbound_bps: 6_200_000 },
  { asn: 'AS149929', name: 'Aplikasi Platform Giga', prefix_count: 3, inbound_bps: 11_800_000, outbound_bps: 2_400_000 },
  { asn: 'AS15021', name: 'Jaringan VNTNET Indonesia', prefix_count: 3, inbound_bps: 850_000, outbound_bps: 320_000 },
  { asn: 'AS149682', name: 'Aplikasi Platform Nomaden', prefix_count: 3, inbound_bps: 1_200_000, outbound_bps: 1_850_000 },
  { asn: 'AS153143', name: 'Melodiva Music Gateway', prefix_count: 3, inbound_bps: 5_400_000, outbound_bps: 120_000 },
]

// ── Prefix tree grouped by ASN matching config.yaml ───────────────────────────

export type ASNPrefixGroup = {
  asn: string
  name: string
  prefix_count: number
  inbound_bps: number
  outbound_bps: number
  tree: PrefixNode[]
}

export const MOCK_PREFIX_GROUPS: ASNPrefixGroup[] = [
  {
    asn: 'AS59278',
    name: 'Jaringan VNT Indonesia',
    prefix_count: 10,
    inbound_bps: 22_500_000,
    outbound_bps: 6_200_000,
    tree: [
      {
        cidr: '103.58.160.0/22',
        level: 22,
        inbound_bps: 10_200_000,
        outbound_bps: 2_800_000,
        children: [
          { cidr: '103.58.160.0/24', level: 24, inbound_bps: 68_000, outbound_bps: 450_000 },
          { cidr: '103.58.161.0/24', level: 24, inbound_bps: 5_200_000, outbound_bps: 1_400_000 },
          { cidr: '103.58.162.0/24', level: 24, inbound_bps: 2_600_000, outbound_bps: 950_000 },
          { cidr: '103.58.163.0/24', level: 24, inbound_bps: 2_332_000, outbound_bps: 0 },
        ],
      },
      {
        cidr: '103.227.240.0/22',
        level: 22,
        inbound_bps: 12_300_000,
        outbound_bps: 3_400_000,
        children: [
          { cidr: '103.227.240.0/24', level: 24, inbound_bps: 20_000, outbound_bps: 350_000 },
          { cidr: '103.227.241.0/24', level: 24, inbound_bps: 4_500_000, outbound_bps: 820_000 },
          { cidr: '103.227.242.0/24', level: 24, inbound_bps: 4_800_000, outbound_bps: 1_850_000 },
          { cidr: '103.227.243.0/24', level: 24, inbound_bps: 2_980_000, outbound_bps: 380_000 },
        ],
      },
    ],
  },
  {
    asn: 'AS149929',
    name: 'Aplikasi Platform Giga',
    prefix_count: 3,
    inbound_bps: 11_800_000,
    outbound_bps: 2_400_000,
    tree: [
      {
        cidr: '103.191.216.0/23',
        level: 23,
        inbound_bps: 11_800_000,
        outbound_bps: 2_400_000,
        children: [
          { cidr: '103.191.216.0/24', level: 24, inbound_bps: 9_200_000, outbound_bps: 1_850_000 },
          { cidr: '103.191.217.0/24', level: 24, inbound_bps: 2_600_000, outbound_bps: 550_000 },
        ],
      },
    ],
  },
  {
    asn: 'AS15021',
    name: 'Jaringan VNTNET Indonesia',
    prefix_count: 3,
    inbound_bps: 850_000,
    outbound_bps: 320_000,
    tree: [
      {
        cidr: '103.196.118.0/23',
        level: 23,
        inbound_bps: 850_000,
        outbound_bps: 320_000,
        children: [
          { cidr: '103.196.118.0/24', level: 24, inbound_bps: 120_000, outbound_bps: 45_000 },
          { cidr: '103.196.119.0/24', level: 24, inbound_bps: 730_000, outbound_bps: 275_000 },
        ],
      },
    ],
  },
  {
    asn: 'AS149682',
    name: 'Aplikasi Platform Nomaden',
    prefix_count: 3,
    inbound_bps: 1_200_000,
    outbound_bps: 1_850_000,
    tree: [
      {
        cidr: '103.184.64.0/23',
        level: 23,
        inbound_bps: 1_200_000,
        outbound_bps: 1_850_000,
        children: [
          { cidr: '103.184.64.0/24', level: 24, inbound_bps: 1_200_000, outbound_bps: 1_850_000 },
          { cidr: '103.184.65.0/24', level: 24, inbound_bps: 0, outbound_bps: 0 },
        ],
      },
    ],
  },
  {
    asn: 'AS153143',
    name: 'Melodiva Music Gateway',
    prefix_count: 3,
    inbound_bps: 5_400_000,
    outbound_bps: 120_000,
    tree: [
      {
        cidr: '103.184.64.0/23',
        level: 23,
        inbound_bps: 5_400_000,
        outbound_bps: 120_000,
        children: [
          { cidr: '103.184.64.0/24', level: 24, inbound_bps: 0, outbound_bps: 0 },
          { cidr: '103.184.65.0/24', level: 24, inbound_bps: 5_400_000, outbound_bps: 120_000 },
        ],
      },
    ],
  },
]

// ── Interfaces matching config.yaml ───────────────────────────────────────────

export const INTERFACES: Interface[] = [
  { id: 'IX.JKT-IX@JK2', name: 'IX.JKT-IX@JK2', type: 'ix', status: 'up', current_bps: 41_750_000 },
  { id: 'IPT.CBN', name: 'IPT.CBN', type: 'transit', status: 'up', current_bps: 12_400_000 },
  { id: 'IPT.iFORTE', name: 'IPT.iFORTE', type: 'transit', status: 'up', current_bps: 8_950_000 },
  { id: 'LC.IIX', name: 'LC.IIX', type: 'ix', status: 'up', current_bps: 15_300_000 },
  { id: 'LC.OIXP', name: 'LC.OIXP', type: 'ix', status: 'up', current_bps: 5_100_000 },
]

// ── Realistic ~40 Mbps Inbound / ~12 Mbps Outbound Time-Series ────────────────

function generateSeries(points = 60) {
  const now = Date.now()
  const series = []
  let inbase = 38_500_000
  let outbase = 10_900_000
  for (let i = points; i >= 0; i--) {
    const t = new Date(now - i * 60_000)
    const jitter = () => (Math.random() - 0.5) * 0.15
    inbase = Math.max(25e6, Math.min(52e6, inbase * (1 + jitter())))
    outbase = Math.max(6e6, Math.min(18e6, outbase * (1 + jitter())))
    series.push({
      timestamp: t.toISOString(),
      inbound_bps: Math.round(inbase),
      outbound_bps: Math.round(outbase),
    })
  }
  return series
}

export const TRAFFIC_SERIES = generateSeries(60)

export const TRAFFIC_SUMMARY = {
  current_inbound_bps: TRAFFIC_SERIES[TRAFFIC_SERIES.length - 1].inbound_bps,
  current_outbound_bps: TRAFFIC_SERIES[TRAFFIC_SERIES.length - 1].outbound_bps,
  peak_inbound_bps: Math.max(...TRAFFIC_SERIES.map((s) => s.inbound_bps)),
  peak_outbound_bps: Math.max(...TRAFFIC_SERIES.map((s) => s.outbound_bps)),
  average_inbound_bps: Math.round(TRAFFIC_SERIES.reduce((a, s) => a + s.inbound_bps, 0) / TRAFFIC_SERIES.length),
  average_outbound_bps: Math.round(TRAFFIC_SERIES.reduce((a, s) => a + s.outbound_bps, 0) / TRAFFIC_SERIES.length),
}

// ── 3-Tier ASN Flow (Sankey) matching real 5 ASNs ─────────────────────────────

export const ASN_FLOW = {
  nodes: [
    // Inbound sources (Left Tier)
    { name: 'AS139057', label: 'AS139057', org: 'Edgenext Legend Dynasty', tier: 'inbound', total: 12_400_000 },
    { name: 'AS20940', label: 'AS20940', org: 'Akamai International B.V.', tier: 'inbound', total: 10_200_000 },
    { name: 'AS149340', label: 'AS149340', org: 'PT Digital Hasanah Indonesia', tier: 'inbound', total: 4_800_000 },
    { name: 'AS147049', label: 'AS147049', org: 'PacketHub S.A.', tier: 'inbound', total: 3_600_000 },
    { name: 'AS63859', label: 'AS63859', org: 'PT. Eka Mas Republik (MyRepublic)', tier: 'inbound', total: 2_800_000 },
    { name: 'AS23693', label: 'AS23693', org: 'PT. Telekomunikasi Selular (Telkomsel)', tier: 'inbound', total: 2_100_000 },
    { name: 'AS138115', label: 'AS138115', org: 'PT Deneva (Niagahoster)', tier: 'inbound', total: 1_900_000 },
    { name: 'AS16625', label: 'AS16625', org: 'Akamai Technologies, Inc.', tier: 'inbound', total: 1_400_000 },
    { name: 'AS396986', label: 'AS396986', org: 'Bytedance Inc. (TikTok)', tier: 'inbound', total: 1_200_000 },
    { name: 'AS17538', label: 'AS17538', org: 'PT. Circlecom Nusantara Indonesia', tier: 'inbound', total: 850_000 },

    // Your 5 Local ASNs (Center Tier)
    { name: 'AS59278', label: 'AS59278', org: 'Jaringan VNT Indonesia', tier: 'local', total: 22_500_000 },
    { name: 'AS149929', label: 'AS149929', org: 'Aplikasi Platform Giga', tier: 'local', total: 11_800_000 },
    { name: 'AS149682', label: 'AS149682', org: 'Aplikasi Platform Nomaden', tier: 'local', total: 1_850_000 },
    { name: 'AS153143', label: 'AS153143', org: 'Melodiva Music Gateway', tier: 'local', total: 5_400_000 },
    { name: 'AS15021', label: 'AS15021', org: 'Jaringan VNTNET Indonesia', tier: 'local', total: 850_000 },

    // Outbound destinations (Right Tier)
    { name: 'AS140443 (Out)', label: 'AS140443', org: 'PT Herza Digital Indonesia', tier: 'outbound', total: 4_200_000 },
    { name: 'AS13335 (Out)', label: 'AS13335', org: 'Cloudflare, Inc.', tier: 'outbound', total: 3_800_000 },
    { name: 'AS30103 (Out)', label: 'AS30103', org: 'Zoom Video Communications, Inc.', tier: 'outbound', total: 1_950_000 },
    { name: 'AS46023 (Out)', label: 'AS46023', org: 'PT Quantum Tera Network', tier: 'outbound', total: 1_200_000 },
    { name: 'AS24429 (Out)', label: 'AS24429', org: 'Zhejiang Taobao Network (Alibaba)', tier: 'outbound', total: 850_000 },
    { name: 'AS140479 (Out)', label: 'AS140479', org: 'PT Inditech Global Network', tier: 'outbound', total: 620_000 },
    { name: 'AS38515 (Out)', label: 'AS38515', org: 'GRAHAMEDIA INFORMASI, PT.', tier: 'outbound', total: 510_000 },
    { name: 'AS209242 (Out)', label: 'AS209242', org: 'Cloudflare London, LLC', tier: 'outbound', total: 420_000 },
    { name: 'AS150279 (Out)', label: 'AS150279', org: 'PT Lintas Network Solusi', tier: 'outbound', total: 310_000 },
    { name: 'AS399358 (Out)', label: 'AS399358', org: 'Anthropic, PBC', tier: 'outbound', total: 180_000 },
  ],
  links: [
    // Inbound links: Sources -> Local ASNs
    { source: 'AS139057', target: 'AS59278', value: 8_400_000 },
    { source: 'AS139057', target: 'AS149929', value: 4_000_000 },
    { source: 'AS20940', target: 'AS149929', value: 6_800_000 },
    { source: 'AS20940', target: 'AS153143', value: 3_400_000 },
    { source: 'AS149340', target: 'AS59278', value: 4_800_000 },
    { source: 'AS147049', target: 'AS59278', value: 3_600_000 },
    { source: 'AS63859', target: 'AS59278', value: 1_900_000 },
    { source: 'AS63859', target: 'AS153143', value: 900_000 },
    { source: 'AS23693', target: 'AS149682', value: 1_200_000 },
    { source: 'AS23693', target: 'AS15021', value: 850_000 },
    { source: 'AS138115', target: 'AS59278', value: 1_900_000 },
    { source: 'AS16625', target: 'AS149929', value: 1_400_000 },
    { source: 'AS396986', target: 'AS153143', value: 1_100_000 },
    { source: 'AS17538', target: 'AS59278', value: 850_000 },

    // Outbound links: Local ASNs -> Destinations
    { source: 'AS59278', target: 'AS140443 (Out)', value: 2_800_000 },
    { source: 'AS59278', target: 'AS13335 (Out)', value: 2_100_000 },
    { source: 'AS59278', target: 'AS30103 (Out)', value: 1_300_000 },
    { source: 'AS149929', target: 'AS140443 (Out)', value: 1_400_000 },
    { source: 'AS149929', target: 'AS13335 (Out)', value: 1_000_000 },
    { source: 'AS149682', target: 'AS13335 (Out)', value: 700_000 },
    { source: 'AS149682', target: 'AS30103 (Out)', value: 650_000 },
    { source: 'AS149682', target: 'AS46023 (Out)', value: 500_000 },
    { source: 'AS59278', target: 'AS46023 (Out)', value: 700_000 },
    { source: 'AS59278', target: 'AS24429 (Out)', value: 850_000 },
    { source: 'AS59278', target: 'AS140479 (Out)', value: 620_000 },
    { source: 'AS59278', target: 'AS38515 (Out)', value: 510_000 },
    { source: 'AS59278', target: 'AS209242 (Out)', value: 420_000 },
    { source: 'AS59278', target: 'AS150279 (Out)', value: 310_000 },
    { source: 'AS59278', target: 'AS399358 (Out)', value: 180_000 },
    { source: 'AS15021', target: 'AS150279 (Out)', value: 120_000 },
    { source: 'AS153143', target: 'AS150279 (Out)', value: 120_000 },
  ],
}

// ── Status ────────────────────────────────────────────────────────────────────

export const STATUS = {
  version: 'v0.7.20',
  online: false,
  prefixCount: MOCK_PREFIX_GROUPS.reduce((a, g) => a + g.prefix_count, 0),
  exporterCount: 1,
  dbMonth: '2026-09',
  lastUpdated: new Date(),
  asnCount: MOCK_ASNS.length,
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function formatMetric(val: number, metric: 'traffic' | 'packets' = 'traffic', decimals = 2): string {
  if (metric === 'packets') {
    if (val >= 1e12) return `${(val / 1e12).toFixed(decimals)} Tpps`
    if (val >= 1e9) return `${(val / 1e9).toFixed(decimals)} Gpps`
    if (val >= 1e6) return `${(val / 1e6).toFixed(decimals)} Mpps`
    if (val >= 1e3) return `${(val / 1e3).toFixed(decimals)} kpps`
    return `${val} pps`
  }
  if (val >= 1e12) return `${(val / 1e12).toFixed(decimals)} Tbps`
  if (val >= 1e9) return `${(val / 1e9).toFixed(decimals)} Gbps`
  if (val >= 1e6) return `${(val / 1e6).toFixed(decimals)} Mbps`
  if (val >= 1e3) return `${(val / 1e3).toFixed(decimals)} Kbps`
  return `${val} bps`
}

export function formatBps(bps: number, decimals = 2): string {
  return formatMetric(bps, 'traffic', decimals)
}

// ── ASN Explorer Mock Generator ───────────────────────────────────────────────

export type AsnDetailSummary = {
  current_inbound_bps: number
  current_outbound_bps: number
  peak_inbound_bps: number
  peak_outbound_bps: number
  total_bps: number
  transit_bps: number
  ix_bps: number
  transit_percent: number
  ix_percent: number
  active_interfaces: string[]
}

export type AsnDetailPoint = {
  timestamp: string
  interfaces: Record<string, number>
  interfaces_in?: Record<string, number>
  interfaces_out?: Record<string, number>
  total_bps: number
}

export type AsnSubnetImpact = {
  cidr: string
  inbound_bps: number
  outbound_bps: number
  total_bps: number
  percent: number
  dominant_interface: string
}

export type AsnDetailResponse = {
  asn: string
  org: string
  summary: AsnDetailSummary
  series: AsnDetailPoint[]
  subnets: AsnSubnetImpact[]
}

export const KNOWN_ASNS: Record<string, string> = {
  AS15169: 'Google LLC',
  AS32934: 'Meta Platforms, Inc.',
  AS13335: 'Cloudflare, Inc.',
  AS20940: 'Akamai International B.V.',
  AS58389: 'PT Telekomunikasi Indonesia',
  AS714: 'Apple Inc.',
  AS139057: 'Edgenext Legend Dynasty',
  AS140443: 'PT Herza Digital Indonesia',
  AS30103: 'Zoom Video Communications, Inc.',
  AS396986: 'Bytedance Inc. (TikTok)',
  AS63859: 'PT. Eka Mas Republik (MyRepublic)',
  AS23693: 'PT. Telekomunikasi Selular (Telkomsel)',
  AS24429: 'Alibaba Cloud (Zhejiang Taobao)',
  AS59278: 'Jaringan VNT Indonesia',
  AS149929: 'Aplikasi Platform Giga',
  AS15021: 'Jaringan VNTNET Indonesia',
  AS149682: 'Aplikasi Platform Nomaden',
  AS153143: 'Melodiva Music Gateway',
}

export function getMockAsnDetail(
  rawAsn: string,
  timeRange: string,
  interfaces: Interface[] = INTERFACES,
  customPrefixes: string[] = []
): AsnDetailResponse {
  const normAsn = rawAsn.toUpperCase().startsWith('AS')
    ? rawAsn.toUpperCase()
    : `AS${rawAsn}`
  const org = KNOWN_ASNS[normAsn] || `Autonomous System ${normAsn.replace('AS', '')}`

  // Deterministic seed multiplier based on ASN digits
  const asnDigits = parseInt(normAsn.replace(/\D/g, ''), 10) || 15169
  const baseBandwidth = 12_000_000 + (asnDigits % 25) * 800_000 // 12 Mbps - 32 Mbps

  // Determine points count and step interval
  let pointCount = 60
  let stepMinutes = 1
  switch (timeRange) {
    case '15m':
      pointCount = 15
      stepMinutes = 1
      break
    case '6h':
      pointCount = 72
      stepMinutes = 5
      break
    case '24h':
      pointCount = 96
      stepMinutes = 15
      break
    case '7d':
      pointCount = 84
      stepMinutes = 120
      break
    default:
      pointCount = 60
      stepMinutes = 1
      break
  }

  const ifaces = interfaces.length > 0 ? interfaces : INTERFACES
  const transitIfaces = ifaces.filter((i) => i.type === 'transit')
  const ixIfaces = ifaces.filter((i) => i.type === 'ix')

  // Transit vs IX bias (e.g. 55% - 75% transit for Google/Akamai or 40% - 60% for Meta)
  const transitRatio = 0.55 + ((asnDigits % 20) - 10) * 0.015
  const ixRatio = 1 - transitRatio

  const now = Date.now()
  const series: AsnDetailPoint[] = []
  const ifaceTotals: Record<string, number> = {}
  ifaces.forEach((i) => {
    ifaceTotals[i.id] = 0
  })

  let peakIn = 0
  let peakOut = 0

  for (let idx = pointCount; idx >= 0; idx--) {
    const t = new Date(now - idx * stepMinutes * 60_000)
    // Sine wave variation + pseudo-random jitter
    const wave = Math.sin((idx / pointCount) * Math.PI * 2) * 0.25
    const jitter = (Math.sin(idx * 7 + (asnDigits % 13)) * 0.15)
    const currentTotal = Math.max(2_000_000, Math.round(baseBandwidth * (1 + wave + jitter)))

    const ptIfaces: Record<string, number> = {}
    const ptIfacesIn: Record<string, number> = {}
    const ptIfacesOut: Record<string, number> = {}

    // Distribute among Transit
    const transitPool = currentTotal * transitRatio
    transitIfaces.forEach((ti, iIdx) => {
      const weight = (iIdx + 1) / Math.max(1, transitIfaces.length)
      const val = Math.round((transitPool / transitIfaces.length) * (0.85 + 0.3 * (weight - 0.5)))
      const inVal = Math.round(val * 0.82)
      const outVal = val - inVal
      ptIfaces[ti.id] = val
      ptIfacesIn[ti.id] = inVal
      ptIfacesOut[ti.id] = outVal
      ifaceTotals[ti.id] = (ifaceTotals[ti.id] || 0) + val
    })

    // Distribute among IX
    const ixPool = currentTotal * ixRatio
    ixIfaces.forEach((ii, iIdx) => {
      const weight = (iIdx + 1) / Math.max(1, ixIfaces.length)
      const val = Math.round((ixPool / ixIfaces.length) * (0.85 + 0.3 * (weight - 0.5)))
      const inVal = Math.round(val * 0.82)
      const outVal = val - inVal
      ptIfaces[ii.id] = val
      ptIfacesIn[ii.id] = inVal
      ptIfacesOut[ii.id] = outVal
      ifaceTotals[ii.id] = (ifaceTotals[ii.id] || 0) + val
    })

    const ptTotal = Object.values(ptIfaces).reduce((a, b) => a + b, 0)
    // Split into pseudo Inbound / Outbound (80% in, 20% out for remote content CDN)
    const inBps = Math.round(ptTotal * 0.82)
    const outBps = ptTotal - inBps

    if (inBps > peakIn) peakIn = inBps
    if (outBps > peakOut) peakOut = outBps

    series.push({
      timestamp: t.toISOString(),
      interfaces: ptIfaces,
      interfaces_in: ptIfacesIn,
      interfaces_out: ptIfacesOut,
      total_bps: ptTotal,
    })
  }

  const latestPoint = series[series.length - 1]
  const currentTotal = latestPoint ? latestPoint.total_bps : baseBandwidth
  const currentIn = Math.round(currentTotal * 0.82)
  const currentOut = currentTotal - currentIn

  let totalTransitBps = 0
  let totalIxBps = 0
  const activeIfaces: string[] = []

  Object.entries(ifaceTotals).forEach(([id, sumVal]) => {
    if (sumVal > 0) {
      activeIfaces.push(id)
      const iface = ifaces.find((i) => i.id === id)
      if (iface?.type === 'transit') {
        totalTransitBps += sumVal
      } else {
        totalIxBps += sumVal
      }
    }
  })

  const sumAll = totalTransitBps + totalIxBps || 1
  const transitPercent = parseFloat(((totalTransitBps / sumAll) * 100).toFixed(1))
  const ixPercent = parseFloat((100 - transitPercent).toFixed(1))

  // Subnets breakdown
  const candidatePrefixes =
    customPrefixes.length > 0
      ? customPrefixes
      : [
          '103.58.161.0/24',
          '103.191.216.0/24',
          '103.227.241.0/24',
          '103.227.242.0/24',
          '103.58.162.0/24',
          '103.184.65.0/24',
          '103.196.119.0/24',
        ]

  const weights = [0.36, 0.24, 0.16, 0.11, 0.07, 0.04, 0.02]
  const subnets: AsnSubnetImpact[] = candidatePrefixes.slice(0, 7).map((cidr, idx) => {
    const w = weights[idx] ?? 0.05
    const subTot = Math.round(currentTotal * w)
    const subIn = Math.round(subTot * 0.83)
    const subOut = subTot - subIn
    // Choose dominant interface
    const domIface =
      idx % 2 === 0
        ? transitIfaces[0]?.id || 'IPT.CBN'
        : ixIfaces[0]?.id || 'LC.OIXP'
    return {
      cidr,
      inbound_bps: subIn,
      outbound_bps: subOut,
      total_bps: subTot,
      percent: parseFloat((w * 100).toFixed(1)),
      dominant_interface: domIface,
    }
  })

  return {
    asn: normAsn,
    org,
    summary: {
      current_inbound_bps: currentIn,
      current_outbound_bps: currentOut,
      peak_inbound_bps: peakIn,
      peak_outbound_bps: peakOut,
      total_bps: currentTotal,
      transit_bps: Math.round(currentTotal * (transitPercent / 100)),
      ix_bps: Math.round(currentTotal * (ixPercent / 100)),
      transit_percent: transitPercent,
      ix_percent: ixPercent,
      active_interfaces: activeIfaces,
    },
    series,
    subnets,
  }
}

// ── Interface Usage & Top 10 ASNs Exportable Report ───────────────────────────

export interface InterfaceReportSummary {
  peak_inbound_bps: number
  peak_outbound_bps: number
  avg_inbound_bps: number
  avg_outbound_bps: number
}

export interface InterfaceReportPoint {
  timestamp: string
  inbound_bps: number
  outbound_bps: number
}

export interface InterfaceReportTopAsn {
  asn: string
  org: string
  bps: number
  percent: number
}

export interface InterfaceReportItem {
  interface_name: string
  type: 'transit' | 'ix'
  summary: InterfaceReportSummary
  series: InterfaceReportPoint[]
  top_asns: InterfaceReportTopAsn[]
}

export interface InterfaceReportResponse {
  time_range: string
  start_time: string
  end_time: string
  reports: InterfaceReportItem[]
}

const MOCK_TOP_TALKERS = [
  { asn: 'AS15169', org: 'Google LLC', share: 0.28 },
  { asn: 'AS32934', org: 'Meta Platforms, Inc.', share: 0.22 },
  { asn: 'AS13335', org: 'Cloudflare, Inc.', share: 0.14 },
  { asn: 'AS20940', org: 'Akamai International B.V.', share: 0.10 },
  { asn: 'AS16509', org: 'Amazon.com, Inc.', share: 0.07 },
  { asn: 'AS139057', org: 'Edgenext Legend Dynasty', share: 0.05 },
  { asn: 'AS714', org: 'Apple Inc.', share: 0.04 },
  { asn: 'AS45102', org: 'Alibaba.com Singapore', share: 0.035 },
  { asn: 'AS149340', org: 'PT Digital Hasanah Indonesia', share: 0.025 },
  { asn: 'AS4761', org: 'PT INDOSAT Tbk', share: 0.02 },
]

export function getMockInterfaceReport(
  timeRange: string = '24h',
  interfaceNames?: string[]
): InterfaceReportResponse {
  const now = Date.now()
  let pointsCount = 24
  let stepMs = 3600 * 1000 // 1 hour
  let rangeMs = 24 * 3600 * 1000

  if (timeRange === '7d') {
    pointsCount = 28
    stepMs = 6 * 3600 * 1000 // 6 hours
    rangeMs = 7 * 24 * 3600 * 1000
  } else if (timeRange === '30d') {
    pointsCount = 30
    stepMs = 24 * 3600 * 1000 // 1 day
    rangeMs = 30 * 24 * 3600 * 1000
  }

  const startTime = new Date(now - rangeMs).toISOString()
  const endTime = new Date(now).toISOString()

  let targetIfaces = INTERFACES
  if (interfaceNames && interfaceNames.length > 0) {
    const set = new Set(interfaceNames)
    const filtered = INTERFACES.filter((i) => set.has(i.name) || set.has(i.id))
    if (filtered.length > 0) {
      targetIfaces = filtered
    } else {
      targetIfaces = interfaceNames.map((name) => ({
        id: name,
        name,
        type: name.startsWith('LC.') || name.startsWith('IX.') ? 'ix' : 'transit',
        status: 'up',
        current_bps: 15_000_000,
      }))
    }
  }

  const reports: InterfaceReportItem[] = targetIfaces.map((iface, ifaceIdx) => {
    const isIX = iface.type === 'ix'
    const baseIn = isIX ? 32_000_000 + (ifaceIdx * 4_000_000) : 22_000_000 + (ifaceIdx * 5_000_000)
    const baseOut = isIX ? 8_000_000 + (ifaceIdx * 1_500_000) : 6_000_000 + (ifaceIdx * 2_000_000)

    const series: InterfaceReportPoint[] = []
    let sumIn = 0
    let sumOut = 0
    let peakIn = 0
    let peakOut = 0

    for (let i = pointsCount; i >= 0; i--) {
      const t = new Date(now - i * stepMs).toISOString()
      const phase = (pointsCount - i) / pointsCount
      const dailyWave = Math.sin(phase * Math.PI * 2) * 0.25
      const jitter = (Math.sin(i * 1.7 + ifaceIdx) * 0.15)
      const inVal = Math.max(1_000_000, Math.round(baseIn * (1 + dailyWave + jitter)))
      const outVal = Math.max(500_000, Math.round(baseOut * (1 + dailyWave * 0.7 + jitter * 0.8)))

      if (inVal > peakIn) peakIn = inVal
      if (outVal > peakOut) peakOut = outVal
      sumIn += inVal
      sumOut += outVal

      series.push({
        timestamp: t,
        inbound_bps: inVal,
        outbound_bps: outVal,
      })
    }

    const count = series.length || 1
    const avgIn = Math.round(sumIn / count)
    const avgOut = Math.round(sumOut / count)

    const top_asns: InterfaceReportTopAsn[] = MOCK_TOP_TALKERS.map((talker, talkerIdx) => {
      // slight per-interface variation
      const mod = 1 + (Math.sin(ifaceIdx * 3 + talkerIdx) * 0.1)
      const bps = Math.round(avgIn * talker.share * mod)
      return {
        asn: talker.asn,
        org: talker.org,
        bps,
        percent: parseFloat((talker.share * 100).toFixed(1)),
      }
    })

    return {
      interface_name: iface.name,
      type: iface.type,
      summary: {
        peak_inbound_bps: peakIn,
        peak_outbound_bps: peakOut,
        avg_inbound_bps: avgIn,
        avg_outbound_bps: avgOut,
      },
      series,
      top_asns,
    }
  })

  // Sort transit first, then alphabetically
  reports.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'transit' ? -1 : 1
    return a.interface_name.localeCompare(b.interface_name)
  })

  return {
    time_range: timeRange,
    start_time: startTime,
    end_time: endTime,
    reports,
  }
}

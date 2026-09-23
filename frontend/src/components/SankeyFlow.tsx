import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import { formatBps } from '../data/mock'
import type { AsnFlowResponse, SankeyNode } from '../api/client'

type Props = {
  data: AsnFlowResponse | null
  localAsns?: string[]
  topN: number
  onTopNChange: (n: number) => void
  onRefresh?: () => void
  theme?: 'dark' | 'light'
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class SankeyErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SankeyFlow ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="w-full h-80 flex items-center justify-center text-slate-500 font-mono text-xs">
            No valid flow linkages available for active filter set.
          </div>
        )
      )
    }
    return this.props.children
  }
}

const TOP_N_OPTIONS = [
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'Top 50', value: 50 },
]

// Distinct color palette for local ASNs (Center Tier) matching brand
const LOCAL_ASN_COLORS: Record<string, string> = {
  AS59278: '#E41919',  // VNT Crimson Red (Jaringan VNT Indonesia)
  AS149929: '#FFCE00', // Nomaden Electric Gold (Aplikasi Platform Giga)
  AS15021: '#A855F7',  // Purple Violet (VNTNET)
  AS149682: '#F97316', // Vibrant Orange (Nomaden)
  AS153143: '#EC4899', // Magenta Pink (Melodiva)
}

// Inbound Source ASNs (Left Tier)
const INBOUND_PALETTE = [
  '#38BDF8', // Sky Blue
  '#818CF8', // Indigo
  '#34D399', // Emerald
  '#F472B6', // Pink
  '#A78BFA', // Purple
  '#FBBF24', // Amber
  '#2DD4BF', // Teal
  '#60A5FA', // Blue
  '#C084FC', // Violet
  '#4ADE80', // Green
  '#38E5FF', // Bright Cyan
  '#E879F9', // Fuchsia
]

// Outbound Destination ASNs (Right Tier)
const OUTBOUND_PALETTE = [
  '#FF7A00', // Neon Orange
  '#FB923C', // Warm Orange
  '#F87171', // Coral Red
  '#F43F5E', // Rose
  '#FB7185', // Warm Pink
  '#F59E0B', // Gold Amber
  '#EF4444', // Crimson
  '#EA580C', // Deep Orange
  '#D946EF', // Magenta
  '#E11D48', // Ruby
  '#F97316', // Bright Orange
  '#BE185D', // Deep Rose
]

export default function SankeyFlow({
  data,
  localAsns = [],
  topN,
  onTopNChange,
  onRefresh,
  theme = 'dark',
}: Props) {
  const isLight = theme === 'light'
  const [directionFilter, setDirectionFilter] = useState<'both' | 'inbound' | 'outbound'>('both')

  const rawNodes = useMemo(() => data?.nodes || [], [data])
  const rawLinks = useMemo(() => data?.links || [], [data])

  // Strict 3-Tier Classification, Deduplication & Strict Forward-Only Link Filtering
  const { sortedNodes, filteredLinks } = useMemo(() => {
    // Helper to determine if an ASN or node is local
    const isLocal = (name: string, tier?: string) =>
      localAsns.includes(name) || tier === 'local'

    // 1. Deduplicate raw nodes by name
    const uniqueNodesMap = new Map<string, SankeyNode>()
    rawNodes.forEach((node) => {
      if (!node || !node.name) return
      if (!uniqueNodesMap.has(node.name)) {
        const isLoc = isLocal(node.name, node.tier)
        uniqueNodesMap.set(node.name, {
          ...node,
          tier: isLoc ? 'local' : node.tier,
        })
      } else {
        const existing = uniqueNodesMap.get(node.name)!
        const isLoc = isLocal(node.name, node.tier) || isLocal(existing.name, existing.tier)
        uniqueNodesMap.set(node.name, {
          ...existing,
          ...node,
          tier: isLoc ? 'local' : (node.tier || existing.tier),
          total: Math.max(existing.total || 0, node.total || 0),
        })
      }
    })

    // Ensure any endpoint in rawLinks exists in uniqueNodesMap
    rawLinks.forEach((l) => {
      if (l.source && !uniqueNodesMap.has(l.source)) {
        const isLoc = isLocal(l.source)
        uniqueNodesMap.set(l.source, {
          name: l.source,
          label: l.source.replace(' (In)', '').replace(' (Out)', ''),
          tier: isLoc ? 'local' : 'inbound',
        })
      }
      if (l.target && !uniqueNodesMap.has(l.target)) {
        const isLoc = isLocal(l.target)
        uniqueNodesMap.set(l.target, {
          name: l.target,
          label: l.target.replace(' (In)', '').replace(' (Out)', ''),
          tier: isLoc ? 'local' : (l.target.includes('(Out)') ? 'outbound' : 'local'),
        })
      }
    })

    // 2. Create nodeTierMap: store depth (0 for inbound, 1 for local, 2 for outbound)
    const nodeTierMap = new Map<string, number>()
    uniqueNodesMap.forEach((node, name) => {
      if (isLocal(name, node.tier)) {
        nodeTierMap.set(name, 1)
      } else if (node.tier === 'inbound') {
        nodeTierMap.set(name, 0)
      } else if (node.tier === 'outbound' || name.includes('(Out)')) {
        nodeTierMap.set(name, 2)
      } else {
        nodeTierMap.set(name, 0)
      }
    })

    // 3. Strict Forward-Only Link Filtering (Guarantees DAG - Zero Cycles)
    const links = rawLinks.filter((l) => {
      if (!l.source || !l.target) return false
      // 1. No self loops
      if (l.source === l.target) return false

      const srcTier = nodeTierMap.get(l.source)
      const tgtTier = nodeTierMap.get(l.target)

      if (srcTier === undefined || tgtTier === undefined) return false

      // 2. Strict forward flow: lower depth to strictly higher depth
      // Drop any intra-tier links (e.g. Local -> Local, 1 < 1 is false) and backward links
      if (srcTier >= tgtTier) return false

      // Direction filter:
      // Inbound: Tier 0 -> Tier 1 (Inbound Peer -> Local Core)
      if (directionFilter === 'inbound' && !(srcTier === 0 && tgtTier === 1)) {
        return false
      }
      // Outbound: Tier 1 -> Tier 2 (Local Core -> Outbound Destination)
      if (directionFilter === 'outbound' && !(srcTier === 1 && tgtTier === 2)) {
        return false
      }

      return true
    })

    // 4. Ensure only nodes that have connected links are passed into ECharts
    const connectedNodeNames = new Set<string>()
    links.forEach((l) => {
      connectedNodeNames.add(l.source)
      connectedNodeNames.add(l.target)
    })

    const filteredNodes = Array.from(connectedNodeNames)
      .map((name) => uniqueNodesMap.get(name)!)
      .filter(Boolean)

    // 5. Strict 3-Tier Classification without duplicates
    // Local nodes: filteredNodes.filter(n => isLocal(n.name)) (assigned depth = 1)
    const localNodes = filteredNodes
      .filter((n) => isLocal(n.name, n.tier))
      .map((n) => ({ ...n, depth: 1, tier: 'local' as const }))

    // Inbound nodes: filteredNodes.filter(n => n.tier === 'inbound' && !isLocal(n.name)) (assigned depth = 0)
    const inboundNodes = filteredNodes
      .filter((n) => !isLocal(n.name, n.tier) && (n.tier === 'inbound' || nodeTierMap.get(n.name) === 0))
      .map((n) => ({ ...n, depth: 0, tier: 'inbound' as const }))

    // Outbound nodes: filteredNodes.filter(n => n.tier === 'outbound' && !isLocal(n.name)) (assigned depth = 2)
    const outboundNodes = filteredNodes
      .filter((n) => !isLocal(n.name, n.tier) && (n.tier === 'outbound' || nodeTierMap.get(n.name) === 2))
      .map((n) => ({ ...n, depth: 2, tier: 'outbound' as const }))

    inboundNodes.sort((a, b) => (b.total || 0) - (a.total || 0))
    localNodes.sort((a, b) => (b.total || 0) - (a.total || 0))
    outboundNodes.sort((a, b) => (b.total || 0) - (a.total || 0))

    const sorted = [...inboundNodes, ...localNodes, ...outboundNodes]

    // 6. Proportional Center-to-Outbound Normalization:
    // In ISP networks, Inbound download volume is 8-10x higher than Outbound upload volume.
    // Scale outbound links so they span the full height of the center local ASN card.
    const localInflow = new Map<string, number>()
    const localOutflow = new Map<string, number>()

    links.forEach((l) => {
      const srcTier = nodeTierMap.get(l.source)
      const tgtTier = nodeTierMap.get(l.target)
      if (srcTier === 0 && tgtTier === 1) {
        localInflow.set(l.target, (localInflow.get(l.target) || 0) + l.value)
      } else if (srcTier === 1 && tgtTier === 2) {
        localOutflow.set(l.source, (localOutflow.get(l.source) || 0) + l.value)
      }
    })

    const normalizedLinks = links.map((l) => {
      const srcTier = nodeTierMap.get(l.source)
      const tgtTier = nodeTierMap.get(l.target)
      let linkVal = l.value
      if (srcTier === 1 && tgtTier === 2 && (directionFilter === 'both' || !directionFilter)) {
        const inTotal = localInflow.get(l.source) || 0
        const outTotal = localOutflow.get(l.source) || 0
        if (inTotal > 0 && outTotal > 0) {
          linkVal = Math.round(l.value * (inTotal / outTotal))
        }
      }
      return {
        source: l.source,
        target: l.target,
        value: linkVal,
        rawValue: l.value,
      }
    })

    return { sortedNodes: sorted, filteredLinks: normalizedLinks }
  }, [rawNodes, rawLinks, directionFilter, localAsns])

  const hasData = sortedNodes.length > 0 && filteredLinks.length > 0

  // Pre-calculate node colors
  const nodeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    let inIdx = 0
    let outIdx = 0

    sortedNodes.forEach((n) => {
      if (n.depth === 1 || n.tier === 'local') {
        map.set(n.name, LOCAL_ASN_COLORS[n.name] || '#E41919')
      } else if (n.depth === 0 || n.tier === 'inbound') {
        map.set(n.name, INBOUND_PALETTE[inIdx % INBOUND_PALETTE.length])
        inIdx++
      } else {
        map.set(n.name, OUTBOUND_PALETTE[outIdx % OUTBOUND_PALETTE.length])
        outIdx++
      }
    })
    return map
  }, [sortedNodes])

  const option = useMemo(() => {
    if (!hasData) {
      return {
        backgroundColor: 'transparent',
        series: [],
      }
    }

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 600,
      tooltip: {
        trigger: 'item',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 30, 46, 0.96)',
        borderColor: isLight ? '#CBD5E1' : '#242E42',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: isLight ? '#0F172A' : '#F1F5F9',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const src = (params.data?.source || '').replace('\n', ' ')
            const tgt = (params.data?.target || '').replace('\n', ' ')
            const displayVal = params.data?.rawValue ?? params.data?.value ?? 0
            return `
              <div style="font-size:12px; font-family:JetBrains Mono, monospace;">
                <div style="color:${isLight ? '#475569' : '#64748B'}; margin-bottom:4px; font-size:11px;">${src} → ${tgt}</div>
                <div style="color:${isLight ? '#D97706' : '#FFCE00'}; font-weight:700; font-size:13px;">${formatBps(displayVal)}</div>
              </div>
            `
          }

          const dataObj = params.data || {}
          const label = dataObj.label || params.name || ''
          const org = dataObj.org || ''
          const totalVolume = dataObj.total ? formatBps(dataObj.total) : ''
          const tier = dataObj.tier || ''

          const tierLabel =
            tier === 'local'
              ? 'Local ISP / AS45287'
              : tier === 'inbound'
              ? 'Inbound Origin Peer'
              : 'Outbound Destination Peer'
          const tierColor =
            tier === 'local' ? '#E41919' : tier === 'inbound' ? '#38BDF8' : isLight ? '#D97706' : '#FFCE00'

          return `
            <div style="font-size:12px; font-family:JetBrains Mono, monospace; min-width:220px; padding:2px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                <span style="color:${isLight ? '#D97706' : '#FFCE00'}; font-weight:700; font-size:13px;">${label}</span>
                <span style="font-size:10px; color:${tierColor}; border:1px solid ${tierColor}40; padding:1px 6px; border-radius:9999px; background:${tierColor}15;">${tierLabel}</span>
              </div>
              ${org ? `<div style="color:${isLight ? '#475569' : '#CBD5E1'}; font-size:11px; margin-bottom:6px; line-height:1.35;">${org}</div>` : ''}
              ${
                totalVolume
                  ? `<div style="color:${isLight ? '#64748B' : '#64748B'}; font-size:11px; border-top:1px solid ${isLight ? '#E2E8F0' : '#242E42'}; padding-top:4px;">Aggregated Bandwidth: <span style="color:${isLight ? '#0F172A' : '#FFFFFF'}; font-weight:700;">${totalVolume}</span></div>`
                  : ''
              }
            </div>
          `
        },
      },
      series: [
        {
          type: 'sankey',
          data: sortedNodes.map((n) => {
            let color = nodeColorMap.get(n.name) || '#E41919'
            if (isLight && n.name === 'AS149929') {
              color = '#D97706'
            }

            return {
              name: n.name,
              label: n.label || n.name,
              org: n.org || '',
              total: n.total || 0,
              tier: n.tier,
              depth: n.depth,
              itemStyle: {
                color,
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: 4,
              },
            }
          }),
          links: filteredLinks.map((l) => {
            const tgtNode = sortedNodes.find((n) => n.name === l.target)
            const isOutbound = tgtNode?.depth === 2 || l.target.includes('(Out)')
            const linkColor = isOutbound
              ? (nodeColorMap.get(l.target) || '#FF7A00')
              : (nodeColorMap.get(l.source) || '#E41919')

            return {
              source: l.source,
              target: l.target,
              value: l.value,
              rawValue: l.rawValue,
              lineStyle: {
                color: linkColor,
                opacity: isLight ? 0.45 : 0.40,
                curveness: 0.5,
              },
            }
          }),
          emphasis: {
            focus: 'adjacency',
            lineStyle: { opacity: 0.85 },
          },
          nodeWidth: 18,
          nodeGap: 16,
          orient: 'horizontal',
          nodeAlign: 'justify',
          layoutIterations: 0,
          left: 70,
          right: 90,
          top: 24,
          bottom: 24,
          label: {
            show: true,
            color: isLight ? '#0F172A' : '#CBD5E1',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            formatter: (p: any) => p.data?.label || p.name,
          },
        },
      ],
    }
  }, [sortedNodes, filteredLinks, nodeColorMap, hasData, isLight])

  return (
    <div className="bg-[#161E2E] border border-[#242E42] rounded-xl p-4 flex flex-col w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#242E42] flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#FFCE00]">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
            <path d="M6 9v12" />
          </svg>
          <span className="font-semibold text-sm text-white tracking-tight">ASN Flow Matrix (Sankey Alluvial)</span>
        </div>

        {/* 3-Tier Legend */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#38BDF8]" />
            <span className="text-slate-400">Inbound Origins (Left)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#E41919]" />
            <span className="text-slate-400">Local ASNs (Center)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#FFCE00]" />
            <span className="text-slate-400">Outbound Destinations (Right)</span>
          </div>
        </div>

        {/* Controls: Direction filter & TopN */}
        <div className="flex items-center gap-2">
          {/* Direction Filter */}
          <div className="flex items-center bg-[#0B0F17] border border-[#242E42] rounded-lg p-0.5">
            {(['both', 'inbound', 'outbound'] as const).map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => setDirectionFilter(d)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition-colors ${
                  directionFilter === d ? 'bg-[#161E2E] text-[#FFCE00] border border-[#FFCE00]/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Top-N Selector */}
          <div className="flex items-center bg-[#0B0F17] border border-[#242E42] rounded-lg p-0.5">
            {TOP_N_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => onTopNChange(opt.value)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  topN === opt.value ? 'bg-[#E41919]/20 text-[#FFCE00] border border-[#FFCE00]/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-2 py-1 text-xs font-mono rounded bg-[#0B0F17] hover:bg-[#161E2E] text-slate-300 border border-[#242E42]"
            >
              Reload
            </button>
          )}
        </div>
      </div>

      {/* Chart Viewport */}
      <div className="w-full h-80 sm:h-96 pt-2">
        {hasData ? (
          <SankeyErrorBoundary
            key={`${directionFilter}-${localAsns.join(',')}-${topN}-${sortedNodes.length}-${filteredLinks.length}`}
            fallback={
              <div className="w-full h-80 flex items-center justify-center text-slate-500 font-mono text-xs">
                No valid flow linkages available for active filter set.
              </div>
            }
          >
            <ReactECharts
              option={option}
              style={{ width: '100%', height: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
              lazyUpdate={true}
            />
          </SankeyErrorBoundary>
        ) : (
          <div className="w-full h-80 flex items-center justify-center text-slate-500 font-mono text-xs">
            No valid flow linkages available for active filter set.
          </div>
        )}
      </div>
    </div>
  )
}

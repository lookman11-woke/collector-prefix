import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { formatBps } from '../data/mock'
import type { AsnFlowResponse } from '../api/client'

type Props = {
  data: AsnFlowResponse | null
  localAsns?: string[]
  topN: number
  onTopNChange: (n: number) => void
  onRefresh?: () => void
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
}: Props) {
  const [directionFilter, setDirectionFilter] = useState<'both' | 'inbound' | 'outbound'>('both')

  const rawNodes = useMemo(() => data?.nodes || [], [data])
  const rawLinks = useMemo(() => data?.links || [], [data])

  // Filter links and nodes by direction
  const { filteredNodes, filteredLinks } = useMemo(() => {
    let links = rawLinks
    if (directionFilter === 'inbound') {
      links = rawLinks.filter((l) => {
        const isTargetLocal = localAsns.includes(l.target)
        return isTargetLocal
      })
    } else if (directionFilter === 'outbound') {
      links = rawLinks.filter((l) => {
        const isSourceLocal = localAsns.includes(l.source)
        return isSourceLocal
      })
    }

    const usedNodeNames = new Set<string>()
    links.forEach((l) => {
      usedNodeNames.add(l.source)
      usedNodeNames.add(l.target)
    })

    const nodes = rawNodes.filter((n) => usedNodeNames.has(n.name))
    return { filteredNodes: nodes, filteredLinks: links }
  }, [rawNodes, rawLinks, directionFilter, localAsns])

  // Sort nodes strictly descending by volume within each tier
  const sortedNodes = useMemo(() => {
    const inbound = filteredNodes.filter((n) => n.tier === 'inbound')
    const local = filteredNodes.filter((n) => n.tier === 'local' || localAsns.includes(n.name))
    const outbound = filteredNodes.filter((n) => n.tier === 'outbound' && !localAsns.includes(n.name))

    inbound.sort((a, b) => (b.total || 0) - (a.total || 0))
    local.sort((a, b) => (b.total || 0) - (a.total || 0))
    outbound.sort((a, b) => (b.total || 0) - (a.total || 0))

    return [...inbound, ...local, ...outbound]
  }, [filteredNodes, localAsns])

  const hasData = sortedNodes.length > 0 && filteredLinks.length > 0

  // Pre-calculate node colors
  const nodeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    let inIdx = 0
    let outIdx = 0

    sortedNodes.forEach((n) => {
      if (n.tier === 'local' || localAsns.includes(n.name)) {
        map.set(n.name, LOCAL_ASN_COLORS[n.name] || '#E41919')
      } else if (n.tier === 'inbound') {
        map.set(n.name, INBOUND_PALETTE[inIdx % INBOUND_PALETTE.length])
        inIdx++
      } else {
        map.set(n.name, OUTBOUND_PALETTE[outIdx % OUTBOUND_PALETTE.length])
        outIdx++
      }
    })
    return map
  }, [sortedNodes, localAsns])

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
        backgroundColor: 'rgba(22, 30, 46, 0.96)',
        borderColor: '#242E42',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#F1F5F9',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const src = (params.data?.source || '').replace('\n', ' ')
            const tgt = (params.data?.target || '').replace('\n', ' ')
            return `
              <div style="font-size:12px; font-family:JetBrains Mono, monospace;">
                <div style="color:#64748B; margin-bottom:4px; font-size:11px;">${src} → ${tgt}</div>
                <div style="color:#FFCE00; font-weight:700; font-size:13px;">${formatBps(params.data?.value || 0)}</div>
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
            tier === 'local' ? '#E41919' : tier === 'inbound' ? '#38BDF8' : '#FFCE00'

          return `
            <div style="font-size:12px; font-family:JetBrains Mono, monospace; min-width:220px; padding:2px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                <span style="color:#FFCE00; font-weight:700; font-size:13px;">${label}</span>
                <span style="font-size:10px; color:${tierColor}; border:1px solid ${tierColor}40; padding:1px 6px; border-radius:9999px; background:${tierColor}15;">${tierLabel}</span>
              </div>
              ${org ? `<div style="color:#CBD5E1; font-size:11px; margin-bottom:6px; line-height:1.35;">${org}</div>` : ''}
              ${
                totalVolume
                  ? `<div style="color:#64748B; font-size:11px; border-top:1px solid #242E42; padding-top:4px;">Aggregated Bandwidth: <span style="color:#FFFFFF; font-weight:700;">${totalVolume}</span></div>`
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
            const isCenter = n.tier === 'local' || localAsns.includes(n.name)
            const isSource = n.tier === 'inbound'

            let depth = 1
            if (isCenter) depth = 1
            else if (isSource) depth = 0
            else depth = 2

            const color = nodeColorMap.get(n.name) || '#E41919'

            return {
              name: n.name,
              label: n.label || n.name,
              org: n.org || '',
              total: n.total || 0,
              tier: n.tier || (isCenter ? 'local' : isSource ? 'inbound' : 'outbound'),
              depth,
              itemStyle: {
                color,
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: 4,
              },
            }
          }),
          links: filteredLinks.map((l) => {
            const srcColor = nodeColorMap.get(l.source) || '#E41919'
            return {
              source: l.source,
              target: l.target,
              value: l.value,
              lineStyle: {
                color: srcColor,
                opacity: 0.38,
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
            color: '#CBD5E1',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            formatter: (p: any) => p.data?.label || p.name,
          },
        },
      ],
    }
  }, [sortedNodes, filteredLinks, localAsns, nodeColorMap, hasData])

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
          <ReactECharts
            option={option}
            style={{ width: '100%', height: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
            lazyUpdate={true}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 font-mono text-xs">
            No ASN matrix linkages available for active filter set.
          </div>
        )}
      </div>
    </div>
  )
}

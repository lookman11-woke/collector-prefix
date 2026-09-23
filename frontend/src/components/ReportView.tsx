import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  getInterfaceReports,
  getTrafficOverview,
  getAsnFlow,
  type Interface,
  type InterfaceReportResponse,
  type InterfaceReportItem,
  type InterfaceReportPoint,
  type TrafficOverviewResponse,
  type AsnFlowResponse,
} from '../api/client'
import { formatMetric, ASN_FLOW } from '../data/mock'

type Props = {
  interfaces: Interface[]
  theme?: 'dark' | 'light'
  onThemeChange?: (theme: 'dark' | 'light') => void
}

function computeUnitScale(peakVal: number) {
  if (peakVal >= 1e12) return { divisor: 1e12, unit: 'Tbps', unitShort: 'T' }
  if (peakVal >= 1e9) return { divisor: 1e9, unit: 'Gbps', unitShort: 'G' }
  if (peakVal >= 1e6) return { divisor: 1e6, unit: 'Mbps', unitShort: 'M' }
  if (peakVal >= 1e3) return { divisor: 1e3, unit: 'Kbps', unitShort: 'K' }
  return { divisor: 1, unit: 'bps', unitShort: '' }
}

const setupSvgViewBox = (chartInstance: any) => {
  const dom = chartInstance?.getDom?.()
  if (!dom) return
  const svg = dom.querySelector('svg')
  if (svg) {
    const w = svg.getAttribute('width') || String(dom.clientWidth || 1200)
    const h = svg.getAttribute('height') || String(dom.clientHeight || 480)
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
}

function InterfaceTimelineChart({
  series,
  timeRange,
  theme = 'dark',
}: {
  series: InterfaceReportPoint[]
  timeRange: string
  theme?: 'dark' | 'light'
}) {
  const isLight = theme === 'light'

  const times = useMemo(() => {
    return series.map((s) => {
      const d = new Date(s.timestamp)
      if (timeRange === '24h') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      return `${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    })
  }, [series, timeRange])

  const peakInWindow = useMemo(() => {
    if (series.length === 0) return 0
    let max = 0
    for (const s of series) {
      if (s.inbound_bps > max) max = s.inbound_bps
      if (s.outbound_bps > max) max = s.outbound_bps
    }
    return max
  }, [series])

  const scale = useMemo(() => computeUnitScale(peakInWindow), [peakInWindow])

  const inSeries = useMemo(() => {
    return series.map((s) => parseFloat((s.inbound_bps / scale.divisor).toFixed(2)))
  }, [series, scale.divisor])

  const outSeries = useMemo(() => {
    return series.map((s) => parseFloat((s.outbound_bps / scale.divisor).toFixed(2)))
  }, [series, scale.divisor])

  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: {
        left: 55,
        right: 20,
        top: 30,
        bottom: 25,
      },
      legend: {
        show: true,
        top: 2,
        right: 20,
        textStyle: {
          color: isLight ? '#334155' : '#94A3B8',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        itemWidth: 12,
        itemHeight: 8,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 30, 46, 0.96)',
        borderColor: isLight ? '#CBD5E1' : '#242E42',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: isLight ? '#0F172A' : '#F1F5F9',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any[]) => {
          const t = params[0]?.axisValue ?? ''
          const rows = (params || [])
            .map((p: any) => {
              const color = p.seriesName === 'Inbound (Ingress)' ? '#E41919' : isLight ? '#D97706' : '#FFCE00'
              return `
                <div style="display:flex; justify-content:space-between; gap:14px; margin-top:2px;">
                  <span style="color:${color}; font-weight:600;">${p.seriesName}:</span>
                  <span style="font-weight:700; color:${isLight ? '#0F172A' : '#FFFFFF'};">${p.value} ${scale.unit}</span>
                </div>
              `
            })
            .join('')
          return `
            <div style="font-size:11px; font-family:JetBrains Mono, monospace;">
              <div style="color:${isLight ? '#475569' : '#64748B'}; margin-bottom:4px; font-weight:600; border-bottom:1px solid ${isLight ? '#E2E8F0' : '#242E42'}; padding-bottom:2px;">Time: ${t}</div>
              ${rows}
            </div>
          `
        },
        axisPointer: {
          type: 'line',
          lineStyle: { color: isLight ? 'rgba(228, 25, 25, 0.5)' : 'rgba(228, 25, 25, 0.4)', type: 'dashed', width: 1 },
        },
      },
      xAxis: {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: isLight ? '#CBD5E1' : '#242E42' } },
        axisTick: { show: false },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          interval: Math.max(1, Math.floor(times.length / 6)),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: scale.unit,
        nameTextStyle: {
          color: isLight ? '#D97706' : '#FFCE00',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          padding: [0, 0, 2, 0],
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (v: number) => `${v}${scale.unitShort}`,
        },
        splitLine: { lineStyle: { color: isLight ? 'rgba(203, 213, 225, 0.6)' : 'rgba(36, 46, 66, 0.6)', type: 'dashed' } },
      },
      series: [
        {
          name: 'Inbound (Ingress)',
          type: 'line',
          data: inSeries,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: '#E41919', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(228, 25, 25, 0.25)' : 'rgba(228, 25, 25, 0.32)' },
                { offset: 1, color: isLight ? 'rgba(228, 25, 25, 0.02)' : 'rgba(228, 25, 25, 0.01)' },
              ],
            },
          },
        },
        {
          name: 'Outbound (Egress)',
          type: 'line',
          data: outSeries,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: isLight ? '#D97706' : '#FFCE00', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(217, 119, 6, 0.22)' : 'rgba(255, 206, 0, 0.28)' },
                { offset: 1, color: isLight ? 'rgba(217, 119, 6, 0.02)' : 'rgba(255, 206, 0, 0.01)' },
              ],
            },
          },
        },
      ],
    }
  }, [times, inSeries, outSeries, scale, isLight])

  return (
    <div className="w-full h-[200px]">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '200px' }}
        opts={{ renderer: 'svg', useViewBox: true } as any}
        notMerge
        onChartReady={setupSvgViewBox}
      />
    </div>
  )
}

function OverallTrafficTimelineChart({
  series,
  timeRange,
  theme = 'dark',
}: {
  series: { timestamp: string; inbound_bps: number; outbound_bps: number }[]
  timeRange: string
  theme?: 'dark' | 'light'
}) {
  const isLight = theme === 'light'

  const times = useMemo(() => {
    return series.map((s) => {
      const d = new Date(s.timestamp)
      if (timeRange === '24h') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      return `${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    })
  }, [series, timeRange])

  const peakInWindow = useMemo(() => {
    if (series.length === 0) return 0
    let max = 0
    for (const s of series) {
      if (s.inbound_bps > max) max = s.inbound_bps
      if (s.outbound_bps > max) max = s.outbound_bps
    }
    return max
  }, [series])

  const scale = useMemo(() => computeUnitScale(peakInWindow), [peakInWindow])

  const inSeries = useMemo(() => {
    return series.map((s) => parseFloat((s.inbound_bps / scale.divisor).toFixed(2)))
  }, [series, scale.divisor])

  const outSeries = useMemo(() => {
    return series.map((s) => parseFloat((s.outbound_bps / scale.divisor).toFixed(2)))
  }, [series, scale.divisor])

  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: {
        left: 55,
        right: 20,
        top: 30,
        bottom: 25,
      },
      legend: {
        show: true,
        top: 2,
        right: 20,
        textStyle: {
          color: isLight ? '#334155' : '#94A3B8',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        itemWidth: 12,
        itemHeight: 8,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 30, 46, 0.96)',
        borderColor: isLight ? '#CBD5E1' : '#242E42',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: isLight ? '#0F172A' : '#F1F5F9',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any[]) => {
          const t = params[0]?.axisValue ?? ''
          const rows = (params || [])
            .map((p: any) => {
              const color = p.seriesName === 'Total Inbound' ? '#E41919' : isLight ? '#D97706' : '#FFCE00'
              return `
                <div style="display:flex; justify-content:space-between; gap:14px; margin-top:2px;">
                  <span style="color:${color}; font-weight:600;">${p.seriesName}:</span>
                  <span style="font-weight:700; color:${isLight ? '#0F172A' : '#FFFFFF'};">${p.value} ${scale.unit}</span>
                </div>
              `
            })
            .join('')
          return `
            <div style="font-size:11px; font-family:JetBrains Mono, monospace;">
              <div style="color:${isLight ? '#475569' : '#64748B'}; margin-bottom:4px; font-weight:600; border-bottom:1px solid ${isLight ? '#E2E8F0' : '#242E42'}; padding-bottom:2px;">Time: ${t}</div>
              ${rows}
            </div>
          `
        },
        axisPointer: {
          type: 'line',
          lineStyle: { color: isLight ? 'rgba(228, 25, 25, 0.5)' : 'rgba(228, 25, 25, 0.4)', type: 'dashed', width: 1 },
        },
      },
      xAxis: {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: isLight ? '#CBD5E1' : '#242E42' } },
        axisTick: { show: false },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          interval: Math.max(1, Math.floor(times.length / 6)),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: scale.unit,
        nameTextStyle: {
          color: isLight ? '#D97706' : '#FFCE00',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          padding: [0, 0, 2, 0],
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (v: number) => `${v}${scale.unitShort}`,
        },
        splitLine: { lineStyle: { color: isLight ? 'rgba(203, 213, 225, 0.6)' : 'rgba(36, 46, 66, 0.6)', type: 'dashed' } },
      },
      series: [
        {
          name: 'Total Inbound',
          type: 'line',
          data: inSeries,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: '#E41919', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(228, 25, 25, 0.25)' : 'rgba(228, 25, 25, 0.32)' },
                { offset: 1, color: isLight ? 'rgba(228, 25, 25, 0.02)' : 'rgba(228, 25, 25, 0.01)' },
              ],
            },
          },
        },
        {
          name: 'Total Outbound',
          type: 'line',
          data: outSeries,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: isLight ? '#D97706' : '#FFCE00', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(217, 119, 6, 0.22)' : 'rgba(255, 206, 0, 0.28)' },
                { offset: 1, color: isLight ? 'rgba(217, 119, 6, 0.02)' : 'rgba(255, 206, 0, 0.01)' },
              ],
            },
          },
        },
      ],
    }
  }, [times, inSeries, outSeries, scale, isLight])

  return (
    <div className="w-full h-[220px]">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'svg', useViewBox: true } as any}
        notMerge
        onChartReady={setupSvgViewBox}
      />
    </div>
  )
}

// Inbound Source ASNs Palette (Sky Blue, Indigo, Emerald, Pink, Purple, Amber, Teal, Blue)
const SANKEY_INBOUND_PALETTE = [
  '#38BDF8',
  '#818CF8',
  '#34D399',
  '#F472B6',
  '#A78BFA',
  '#FBBF24',
  '#2DD4BF',
  '#60A5FA',
  '#C084FC',
  '#4ADE80',
  '#38E5FF',
  '#E879F9',
]

// Outbound Destination ASNs Palette (Neon Orange, Coral, Rose, Gold Amber, Magenta, Ruby)
const SANKEY_OUTBOUND_PALETTE = [
  '#FF7A00',
  '#FB923C',
  '#F87171',
  '#F43F5E',
  '#FB7185',
  '#F59E0B',
  '#EF4444',
  '#EA580C',
  '#D946EF',
  '#E11D48',
  '#F97316',
  '#BE185D',
]

// Local internal ASNs color map
const DEFAULT_LOCAL_ASNS = ['AS59278', 'AS149929', 'AS149682', 'AS153143', 'AS15021']

const SANKEY_LOCAL_ASN_COLORS: Record<string, string> = {
  AS59278: '#E41919',  // VNT Crimson Red
  AS149929: '#FFCE00', // Nomaden Electric Gold
  AS15021: '#A855F7',  // Purple Violet
  AS149682: '#F97316', // Vibrant Orange
  AS153143: '#EC4899', // Magenta Pink
}

function MacroPeeringSankeyChart({
  sankeyData,
  theme = 'dark',
}: {
  sankeyData: AsnFlowResponse | null
  theme?: 'dark' | 'light'
}) {
  const isLight = theme === 'light'

  const { nodes, links } = useMemo(() => {
    // 1. Source nodes & links directly from sankeyData or fallback to mock ASN_FLOW
    const rawNodes =
      sankeyData && Array.isArray(sankeyData.nodes) && sankeyData.nodes.length > 0
        ? sankeyData.nodes
        : ASN_FLOW.nodes
    const rawLinks =
      sankeyData && Array.isArray(sankeyData.links) && sankeyData.links.length > 0
        ? sankeyData.links
        : ASN_FLOW.links

    // 2. Classify nodes into 3 tiers matching SankeyFlow.tsx
    const inbound = rawNodes.filter((n) => n.tier === 'inbound')
    const local = rawNodes.filter((n) => n.tier === 'local' || DEFAULT_LOCAL_ASNS.includes(n.name))
    const outbound = rawNodes.filter((n) => n.tier === 'outbound' && !DEFAULT_LOCAL_ASNS.includes(n.name))

    // 3. Sort strictly descending by volume, capping inbound & outbound to top 8
    const sortedInbound = [...inbound]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 8)
    const sortedLocal = [...local]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
    const sortedOutbound = [...outbound]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 8)

    const activeNodeNames = new Set([
      ...sortedInbound.map((n) => n.name),
      ...sortedLocal.map((n) => n.name),
      ...sortedOutbound.map((n) => n.name),
    ])

    // 4. Filter links connecting active nodes with positive volume
    const validLinks = rawLinks.filter((l) => {
      return l.value > 0 && activeNodeNames.has(l.source) && activeNodeNames.has(l.target)
    })

    // 5. Retain only nodes that participate in valid links to avoid orphan nodes
    const connectedNodeNames = new Set<string>()
    validLinks.forEach((l) => {
      connectedNodeNames.add(l.source)
      connectedNodeNames.add(l.target)
    })

    const finalInbound = sortedInbound.filter((n) => connectedNodeNames.has(n.name))
    const finalLocal = sortedLocal.filter((n) => connectedNodeNames.has(n.name))
    const finalOutbound = sortedOutbound.filter((n) => connectedNodeNames.has(n.name))

    // 6. Assign color mapping
    const nodeColorMap = new Map<string, string>()
    finalInbound.forEach((n, idx) => {
      nodeColorMap.set(n.name, SANKEY_INBOUND_PALETTE[idx % SANKEY_INBOUND_PALETTE.length])
    })
    finalLocal.forEach((n) => {
      const col = isLight && n.name === 'AS149929' ? '#D97706' : (SANKEY_LOCAL_ASN_COLORS[n.name] || '#E41919')
      nodeColorMap.set(n.name, col)
    })
    finalOutbound.forEach((n, idx) => {
      nodeColorMap.set(n.name, SANKEY_OUTBOUND_PALETTE[idx % SANKEY_OUTBOUND_PALETTE.length])
    })

    // 7. Build ECharts node items with explicit depths
    const echartsNodes = [
      ...finalInbound.map((n) => ({
        name: n.name,
        nodeLabel: n.label || n.name,
        label: {
          position: 'right' as const,
          distance: 8,
        },
        org: n.org || '',
        total: n.total || 0,
        tier: 'inbound',
        depth: 0,
        itemStyle: {
          color: nodeColorMap.get(n.name) || '#38BDF8',
          borderColor: 'transparent',
          borderWidth: 0,
          borderRadius: 3,
        },
      })),
      ...finalLocal.map((n) => ({
        name: n.name,
        nodeLabel: n.label || n.name,
        label: {
          position: 'right' as const,
          distance: 8,
        },
        org: n.org || '',
        total: n.total || 0,
        tier: 'local',
        depth: 1,
        itemStyle: {
          color: nodeColorMap.get(n.name) || '#E41919',
          borderColor: 'transparent',
          borderWidth: 0,
          borderRadius: 3,
        },
      })),
      ...finalOutbound.map((n) => ({
        name: n.name,
        nodeLabel: n.label || n.name,
        label: {
          position: 'left' as const,
          distance: 8,
        },
        org: n.org || '',
        total: n.total || 0,
        tier: 'outbound',
        depth: 2,
        itemStyle: {
          color: nodeColorMap.get(n.name) || '#FF7A00',
          borderColor: 'transparent',
          borderWidth: 0,
          borderRadius: 3,
        },
      })),
    ]

    // 8. Proportional Center-to-Outbound Normalization:
    // Scale outbound links departing local core so ribbons span 100% of the local ASN card height.
    const nodeTierMap = new Map<string, number>()
    finalInbound.forEach((n) => nodeTierMap.set(n.name, 0))
    finalLocal.forEach((n) => nodeTierMap.set(n.name, 1))
    finalOutbound.forEach((n) => nodeTierMap.set(n.name, 2))

    const localInflow = new Map<string, number>()
    const localOutflow = new Map<string, number>()

    validLinks.forEach((l) => {
      const srcTier = nodeTierMap.get(l.source)
      const tgtTier = nodeTierMap.get(l.target)
      if (srcTier === 0 && tgtTier === 1) {
        localInflow.set(l.target, (localInflow.get(l.target) || 0) + l.value)
      } else if (srcTier === 1 && tgtTier === 2) {
        localOutflow.set(l.source, (localOutflow.get(l.source) || 0) + l.value)
      }
    })

    const echartsLinks = validLinks.map((l) => {
      const srcColor = nodeColorMap.get(l.source) || '#E41919'
      const srcTier = nodeTierMap.get(l.source)
      const tgtTier = nodeTierMap.get(l.target)
      let linkVal = l.value
      if (srcTier === 1 && tgtTier === 2) {
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
        lineStyle: {
          color: srcColor,
          opacity: isLight ? 0.40 : 0.35,
          curveness: 0.5,
        },
      }
    })

    return {
      nodes: echartsNodes,
      links: echartsLinks,
    }
  }, [sankeyData, isLight])

  const hasData = nodes.length > 0 && links.length > 0

  const option = useMemo(() => {
    if (!hasData) {
      return {
        backgroundColor: 'transparent',
        series: [],
      }
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 30, 46, 0.96)',
        borderColor: isLight ? '#CBD5E1' : '#242E42',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: isLight ? '#0F172A' : '#F1F5F9',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const src = (params.data?.source || '').replace('\n', ' ')
            const tgt = (params.data?.target || '').replace('\n', ' ')
            const val = params.data?.rawValue ?? params.data?.value ?? 0
            return `
              <div style="font-size:11px; font-family:JetBrains Mono, monospace;">
                <div style="color:${isLight ? '#475569' : '#64748B'}; margin-bottom:4px;">${src} → ${tgt}</div>
                <div style="color:${isLight ? '#D97706' : '#FFCE00'}; font-weight:700; font-size:12px;">${formatMetric(val, 'traffic')}</div>
              </div>
            `
          }
          const data = params.data || {}
          const label = data.nodeLabel || (typeof data.label === 'string' ? data.label : '') || params.name || ''
          const org = data.org || ''
          const totalVolume = data.total ? formatMetric(data.total, 'traffic') : ''
          const tier = data.tier || ''

          const tierLabel =
            tier === 'local'
              ? 'Local ISP Core'
              : tier === 'inbound'
              ? 'Inbound Origin Peer'
              : 'Outbound Destination Peer'
          const tierColor =
            tier === 'local'
              ? '#E41919'
              : tier === 'inbound'
              ? (isLight ? '#0284C7' : '#38BDF8')
              : (isLight ? '#D97706' : '#FFCE00')

          return `
            <div style="font-size:11px; font-family:JetBrains Mono, monospace; min-width:200px; padding:2px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                <span style="color:${isLight ? '#0F172A' : '#FFFFFF'}; font-weight:700; font-size:12px;">${label}</span>
                <span style="font-size:9.5px; color:${tierColor}; border:1px solid ${tierColor}40; padding:1px 5px; border-radius:9999px; background:${tierColor}15;">${tierLabel}</span>
              </div>
              ${org ? `<div style="color:${isLight ? '#475569' : '#94A3B8'}; font-size:10px; margin-bottom:4px; line-height:1.35;">${org}</div>` : ''}
              ${
                totalVolume
                  ? `<div style="color:${isLight ? '#64748B' : '#94A3B8'}; font-size:10px; border-top:1px solid ${isLight ? '#E2E8F0' : '#242E42'}; padding-top:4px;">Volume: <span style="color:${isLight ? '#0F172A' : '#FFFFFF'}; font-weight:700;">${totalVolume}</span></div>`
                  : ''
              }
            </div>
          `
        },
      },
      series: [
        {
          type: 'sankey',
          data: nodes,
          links: links,
          emphasis: {
            focus: 'adjacency',
            lineStyle: { opacity: 0.85 },
          },
          nodeWidth: 18,
          nodeGap: 18,
          orient: 'horizontal',
          nodeAlign: 'justify',
          layoutIterations: 0,
          left: 20,
          right: 30,
          top: 24,
          bottom: 24,
          label: {
            show: true,
            color: isLight ? '#0F172A' : '#CBD5E1',
            fontSize: 10.5,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            formatter: (p: any) => {
              const org = p.data?.org
              const displayName = (p.data?.nodeLabel || p.name || '').replace(' (Out)', '')
              if (org) {
                const shortOrg = org.length > 20 ? org.slice(0, 18) + '…' : org
                return `${displayName}\n{sub|${shortOrg}}`
              }
              return displayName
            },
            rich: {
              sub: {
                fontSize: 8.5,
                color: isLight ? '#475569' : '#94A3B8',
                lineHeight: 12,
              },
            },
          },
          lineStyle: {
            curveness: 0.5,
          },
        },
      ],
    }
  }, [nodes, links, isLight, hasData])

  if (!hasData) {
    return (
      <div className={`w-full h-[480px] flex items-center justify-center font-mono text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
        No ASN flow data available for the selected interface scope.
      </div>
    )
  }

  return (
    <div className="w-full h-[480px]">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '480px' }}
        opts={{ renderer: 'svg', useViewBox: true } as any}
        notMerge
        onChartReady={setupSvgViewBox}
      />
    </div>
  )
}

function generateCSV(data: InterfaceReportResponse) {
  const lines: string[] = []

  lines.push(`"ISP Bandwidth Utilization & Peering Report"`)
  lines.push(`"Generated At","${new Date().toISOString()}"`)
  lines.push(`"Time Range","${data.time_range}"`)
  lines.push(`"Start Time","${data.start_time}"`)
  lines.push(`"End Time","${data.end_time}"`)
  lines.push(``)

  lines.push(`"--- INTERFACE UTILIZATION SUMMARY ---"`)
  lines.push(`"Interface","Type","Peak Inbound (bps)","Peak Outbound (bps)","Avg Inbound (bps)","Avg Outbound (bps)","Peak In (Formatted)","Peak Out (Formatted)","Avg In (Formatted)","Avg Out (Formatted)"`)
  data.reports.forEach((r) => {
    lines.push([
      `"${r.interface_name}"`,
      `"${r.type.toUpperCase()}"`,
      r.summary.peak_inbound_bps,
      r.summary.peak_outbound_bps,
      r.summary.avg_inbound_bps,
      r.summary.avg_outbound_bps,
      `"${formatMetric(r.summary.peak_inbound_bps, 'traffic')}"`,
      `"${formatMetric(r.summary.peak_outbound_bps, 'traffic')}"`,
      `"${formatMetric(r.summary.avg_inbound_bps, 'traffic')}"`,
      `"${formatMetric(r.summary.avg_outbound_bps, 'traffic')}"`,
    ].join(','))
  })
  lines.push(``)

  lines.push(`"--- TOP TALKER SOURCE ASNS PER INTERFACE ---"`)
  lines.push(`"Interface","Type","Rank","ASN","Organization","Average Rate (bps)","Rate (Formatted)","% Share"`)
  data.reports.forEach((r) => {
    r.top_asns.forEach((asn, idx) => {
      lines.push([
        `"${r.interface_name}"`,
        `"${r.type.toUpperCase()}"`,
        idx + 1,
        `"${asn.asn}"`,
        `"${(asn.org || '').replace(/"/g, '""')}"`,
        asn.bps,
        `"${formatMetric(asn.bps, 'traffic')}"`,
        `${asn.percent.toFixed(1)}%`,
      ].join(','))
    })
  })
  lines.push(``)

  lines.push(`"--- TIMELINE USAGE DATA ---"`)
  lines.push(`"Interface","Timestamp","Inbound (bps)","Outbound (bps)"`)
  data.reports.forEach((r) => {
    r.series.forEach((pt) => {
      lines.push([
        `"${r.interface_name}"`,
        `"${pt.timestamp}"`,
        pt.inbound_bps,
        pt.outbound_bps,
      ].join(','))
    })
  })

  return lines.join('\r\n')
}

export default function ReportView({ interfaces, theme, onThemeChange }: Props) {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(
    () => new Set(interfaces.map((i) => i.id))
  )
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<InterfaceReportResponse | null>(null)
  const [overallTraffic, setOverallTraffic] = useState<TrafficOverviewResponse | null>(null)
  const [sankeyData, setSankeyData] = useState<AsnFlowResponse | null>(null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [printTheme, setPrintTheme] = useState<'dark' | 'light'>(() => theme || 'dark')

  useEffect(() => {
    if (theme) {
      setPrintTheme(theme)
    }
  }, [theme])

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setPrintTheme(newTheme)
    onThemeChange?.(newTheme)
  }

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const ifaceList = Array.from(selectedInterfaces)
      const [data, trafficRes, flowRes] = await Promise.all([
        getInterfaceReports(
          {
            time_range: timeRange,
            interfaces: ifaceList,
          },
          interfaces
        ),
        getTrafficOverview({
          time_range: timeRange,
          metric: 'traffic',
          direction: 'both',
          selected_interfaces: ifaceList,
          selected_asns: [],
          selected_prefixes: [],
        }),
        getAsnFlow({
          time_range: timeRange,
          selected_interfaces: ifaceList,
          selected_asns: [],
          selected_prefixes: [],
          top_n: 8,
        }),
      ])
      setReportData(data)
      setOverallTraffic(trafficRes)
      setSankeyData(flowRes)
      setGeneratedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [timeRange, selectedInterfaces, interfaces])

  useEffect(() => {
    let active = true
    const ifaceList = Array.from(selectedInterfaces)
    void Promise.all([
      getInterfaceReports(
        {
          time_range: timeRange,
          interfaces: ifaceList,
        },
        interfaces
      ),
      getTrafficOverview({
        time_range: timeRange,
        metric: 'traffic',
        direction: 'both',
        selected_interfaces: ifaceList,
        selected_asns: [],
        selected_prefixes: [],
      }),
      getAsnFlow({
        time_range: timeRange,
        selected_interfaces: ifaceList,
        selected_asns: [],
        selected_prefixes: [],
        top_n: 8,
      }),
    ]).then(([rep, traf, flow]) => {
      if (active) {
        setReportData(rep)
        setOverallTraffic(traf)
        setSankeyData(flow)
        setGeneratedAt(new Date())
      }
    })
    return () => {
      active = false
    }
  }, [timeRange, selectedInterfaces, interfaces])

  const ensureViewBoxes = () => {
    document.querySelectorAll<SVGElement>('.echarts-for-react > div > svg').forEach((svg) => {
      const w = svg.getAttribute('width') || String(svg.parentElement?.clientWidth || 1200)
      const h = svg.getAttribute('height') || String(svg.parentElement?.clientHeight || 480)
      if (w && h) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      }
    })
  }

  useEffect(() => {
    const handleBeforePrint = () => {
      ensureViewBoxes()
      window.dispatchEvent(new Event('resize'))
      ensureViewBoxes()
    }
    window.addEventListener('beforeprint', handleBeforePrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
    }
  }, [])

  const handleToggleInterface = (id: string) => {
    setSelectedInterfaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedInterfaces(new Set(interfaces.map((i) => i.id)))
  }

  const handleClearAll = () => {
    setSelectedInterfaces(new Set())
  }

  const handleSelectTransit = () => {
    setSelectedInterfaces(new Set(interfaces.filter((i) => i.type === 'transit').map((i) => i.id)))
  }

  const handleSelectIX = () => {
    setSelectedInterfaces(new Set(interfaces.filter((i) => i.type === 'ix').map((i) => i.id)))
  }

  const handleExportCSV = () => {
    if (!reportData) return
    const csvContent = generateCSV(reportData)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `isp-usage-report-${timeRange}-${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    ensureViewBoxes()
    window.print()
  }

  // Aggregate executive metrics
  const totals = useMemo(() => {
    if (!reportData || reportData.reports.length === 0) {
      return { totalPeakIn: 0, totalPeakOut: 0, totalAvgIn: 0, totalAvgOut: 0 }
    }
    return reportData.reports.reduce(
      (acc, r) => ({
        totalPeakIn: acc.totalPeakIn + r.summary.peak_inbound_bps,
        totalPeakOut: acc.totalPeakOut + r.summary.peak_outbound_bps,
        totalAvgIn: acc.totalAvgIn + r.summary.avg_inbound_bps,
        totalAvgOut: acc.totalAvgOut + r.summary.avg_outbound_bps,
      }),
      { totalPeakIn: 0, totalPeakOut: 0, totalAvgIn: 0, totalAvgOut: 0 }
    )
  }, [reportData])

  const overallSeries = useMemo(() => {
    if (overallTraffic && overallTraffic.series && overallTraffic.series.length > 0) {
      return overallTraffic.series
    }
    if (!reportData || reportData.reports.length === 0) return []
    const firstSeries = reportData.reports[0].series
    const aggregated: { timestamp: string; inbound_bps: number; outbound_bps: number }[] = []
    for (let i = 0; i < firstSeries.length; i++) {
      const timestamp = firstSeries[i].timestamp
      let inBps = 0
      let outBps = 0
      for (const r of reportData.reports) {
        if (r.series[i]) {
          inBps += r.series[i].inbound_bps
          outBps += r.series[i].outbound_bps
        }
      }
      aggregated.push({ timestamp, inbound_bps: inBps, outbound_bps: outBps })
    }
    return aggregated
  }, [overallTraffic, reportData])

  const isLight = printTheme === 'light'

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12 report-canvas">
      {/* Dynamic Print CSS to guarantee clean A4 printable output */}
      <style>{`
        @media print {
          @page {
            size: A4 ${orientation};
            margin: 8mm;
          }
          html, body, #root, main {
            background: ${isLight ? '#FFFFFF' : '#0B0F17'} !important;
            color: ${isLight ? '#0F172A' : '#F1F5F9'} !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .report-canvas {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .report-cover-page {
            page-break-after: always !important;
            break-after: page !important;
            margin-bottom: 0 !important;
            box-shadow: none !important;
            ${isLight ? `
              background-color: #FFFFFF !important;
              border: 1px solid #CBD5E1 !important;
              color: #0F172A !important;
            ` : `
              background-color: #161E2E !important;
              border: 1px solid #242E42 !important;
            `}
          }
          .report-sankey-page {
            page-break-before: always !important;
            break-before: page !important;
            page-break-after: always !important;
            break-after: page !important;
            margin-bottom: 0 !important;
            box-shadow: none !important;
            ${isLight ? `
              background-color: #FFFFFF !important;
              border: 1px solid #CBD5E1 !important;
              color: #0F172A !important;
            ` : `
              background-color: #161E2E !important;
              border: 1px solid #242E42 !important;
            `}
          }
          .report-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            margin-bottom: 0 !important;
            box-shadow: none !important;
            ${isLight ? `
              background-color: #FFFFFF !important;
              border: 1px solid #CBD5E1 !important;
              color: #0F172A !important;
            ` : `
              background-color: #161E2E !important;
              border: 1px solid #242E42 !important;
            `}
          }
          .report-card:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .cover-table-container {
            overflow: visible !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .chart-panel, .asn-panel {
            min-width: 0 !important;
            overflow: hidden !important;
          }
          .chart-panel canvas,
          .sankey-panel canvas,
          .overall-chart-panel canvas {
            max-width: 100% !important;
          }
          svg.w-4, svg.w-3\\.5, svg.w-5, .w-4 > svg {
            width: 1rem !important;
            height: 1rem !important;
            max-width: 1rem !important;
            min-width: 1rem !important;
          }
          .echarts-for-react,
          .echarts-for-react > div {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }
          .echarts-for-react > div > svg {
            width: 100% !important;
            height: auto !important;
            max-width: 100% !important;
            display: block !important;
          }
          /* Theme-specific styles for sub-boxes, tables, and borders */
          ${isLight ? `
            .metric-box, .chart-panel, .asn-panel, .cover-table-container, .overall-chart-panel, .sankey-panel {
              background-color: #F8FAFC !important;
              border-color: #CBD5E1 !important;
            }
            .metric-box span, .text-slate-400, .text-slate-500 {
              color: #475569 !important;
            }
            .text-white, .text-slate-100, .text-slate-200 {
              color: #0F172A !important;
            }
            table, tr, td, th {
              border-color: #E2E8F0 !important;
            }
            .asn-row:hover {
              background-color: transparent !important;
            }
          ` : ''}
        }
      `}</style>

      {/* ── Top Control Bar (Hidden in Print) ─────────────────────────────────── */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[#161E2E] border border-[#242E42] shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0B0F17] rounded-lg border border-[#242E42]">
            {(['24h', '7d', '30d'] as const).map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => setTimeRange(tr)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-all ${
                  timeRange === tr
                    ? 'bg-[#E41919] text-white shadow-sm shadow-[#E41919]/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
                }`}
              >
                {tr === '24h' ? 'Last 24 Hours' : tr === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>

          {/* Interface Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono bg-[#0B0F17] text-slate-200 rounded-lg border border-[#242E42] hover:border-slate-600 transition-all shadow-sm"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Interfaces:</span>
              <span className="px-1.5 py-0.5 rounded bg-[#E41919]/20 text-[#FCA5A5] font-bold text-[11px]">
                {selectedInterfaces.size} of {interfaces.length}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 p-3 bg-[#161E2E] border border-[#242E42] rounded-xl shadow-2xl z-50">
                <div className="flex items-center justify-between gap-1 pb-2.5 mb-2.5 border-b border-[#242E42]">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Quick Filter</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2 py-0.5 text-[10px] font-mono text-slate-300 hover:text-white bg-[#0B0F17] hover:bg-[#242E42] rounded border border-[#242E42]"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectTransit}
                      className="px-2 py-0.5 text-[10px] font-mono text-[#FCA5A5] hover:text-white bg-[#E41919]/20 hover:bg-[#E41919]/40 rounded border border-[#E41919]/30"
                    >
                      Transit
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectIX}
                      className="px-2 py-0.5 text-[10px] font-mono text-[#FFCE00] hover:text-white bg-[#FFCE00]/20 hover:bg-[#FFCE00]/40 rounded border border-[#FFCE00]/30"
                    >
                      IX
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="px-2 py-0.5 text-[10px] font-mono text-slate-400 hover:text-slate-200 bg-[#0B0F17] hover:bg-[#242E42] rounded border border-[#242E42]"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
                  {interfaces.map((iface) => {
                    const isChecked = selectedInterfaces.has(iface.id)
                    return (
                      <label
                        key={iface.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#0B0F17] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleInterface(iface.id)}
                            className="w-3.5 h-3.5 rounded border-slate-700 text-[#E41919] focus:ring-0 focus:ring-offset-0 bg-[#0B0F17]"
                          />
                          <span className="text-xs font-mono text-slate-200">{iface.name}</span>
                        </div>
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                            iface.type === 'transit'
                              ? 'bg-[#E41919]/20 text-[#FCA5A5] border border-[#E41919]/35'
                              : 'bg-[#FFCE00]/20 text-[#FFCE00] border border-[#FFCE00]/35'
                          }`}
                        >
                          {iface.type}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Orientation Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg border border-[#242E42]">
            <span className="text-[10px] font-mono text-slate-400 px-1.5 uppercase font-semibold">Layout:</span>
            <button
              type="button"
              onClick={() => setOrientation('portrait')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                orientation === 'portrait'
                  ? 'bg-[#E41919] text-white shadow-sm shadow-[#E41919]/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
              }`}
            >
              Portrait
            </button>
            <button
              type="button"
              onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                orientation === 'landscape'
                  ? 'bg-[#E41919] text-white shadow-sm shadow-[#E41919]/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
              }`}
            >
              Landscape
            </button>
          </div>

          {/* Theme Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg border border-[#242E42]">
            <span className="text-[10px] font-mono text-slate-400 px-1.5 uppercase font-semibold">Theme:</span>
            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                printTheme === 'dark'
                  ? 'bg-[#E41919] text-white shadow-sm shadow-[#E41919]/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
              }`}
            >
              Dark (Obsidian)
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                printTheme === 'light'
                  ? 'bg-[#E41919] text-white shadow-sm shadow-[#E41919]/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
              }`}
            >
              Light (Ink)
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg bg-[#0B0F17] text-slate-200 border border-[#242E42] hover:border-slate-500 hover:text-white transition-all shadow-sm disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loading ? 'Refreshing...' : 'Generate Report'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!reportData}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg bg-[#0B0F17] text-[#FFCE00] border border-[#FFCE00]/40 hover:bg-[#FFCE00]/10 hover:border-[#FFCE00] transition-all shadow-sm disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!reportData}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-bold rounded-lg bg-[#E41919] text-white hover:bg-[#B91C1C] transition-all shadow-md shadow-[#E41919]/30 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* ── Page 1: Executive Cover Page ─────────────────────────────────────── */}
      <div
        className={`report-cover-page p-6 rounded-2xl border shadow-xl flex flex-col gap-4 ${
          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#161E2E] border-[#242E42] text-white'
        }`}
      >
        {/* Document Header & Meta */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 ${isLight ? 'border-slate-200' : 'border-[#242E42]'}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E41919] animate-pulse" />
              <span className={`text-xs font-mono uppercase tracking-widest font-bold ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                Operational Telemetry Report
              </span>
            </div>
            <h1 className={`text-2xl md:text-3xl font-bold tracking-tight m-0 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              ISP Bandwidth Utilization & Peering Report
            </h1>
            <p className={`text-xs md:text-sm mt-1 mb-0 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Granular link throughput, ingress/egress peak analysis, and Top 10 Talker Source ASN distribution.
            </p>
          </div>

          <div className={`flex flex-col sm:items-end text-xs font-mono gap-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
            <div className="flex items-center gap-1.5">
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Generated:</span>
              <span className={`font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {generatedAt ? generatedAt.toUTCString() : 'Just now'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Time Range:</span>
              <span className={`font-bold ${isLight ? 'text-amber-700' : 'text-[#FFCE00]'}`}>
                {timeRange === '24h' ? 'Last 24 Hours' : timeRange === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Reporting Scope:</span>
              <span className={`font-semibold ${isLight ? 'text-red-700' : 'text-[#FCA5A5]'}`}>
                {reportData?.reports.length || 0} Interfaces Selected
              </span>
            </div>
          </div>
        </div>

        {/* Executive Summary Numbers (4 Global KPIs) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-1">
          <div className={`metric-box p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            <div className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Total Peak Ingress</div>
            <div className="text-lg md:text-xl font-mono font-bold text-[#E41919] mt-0.5">
              {formatMetric(totals.totalPeakIn, 'traffic')}
            </div>
          </div>
          <div className={`metric-box p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            <div className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Total Peak Egress</div>
            <div className={`text-lg md:text-xl font-mono font-bold mt-0.5 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
              {formatMetric(totals.totalPeakOut, 'traffic')}
            </div>
          </div>
          <div className={`metric-box p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            <div className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Total Average Ingress</div>
            <div className={`text-lg md:text-xl font-mono font-bold mt-0.5 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              {formatMetric(totals.totalAvgIn, 'traffic')}
            </div>
          </div>
          <div className={`metric-box p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            <div className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Total Average Egress</div>
            <div className={`text-lg md:text-xl font-mono font-bold mt-0.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              {formatMetric(totals.totalAvgOut, 'traffic')}
            </div>
          </div>
        </div>

        {/* Aggregate Network Bandwidth Timeline */}
        {overallSeries.length > 0 && (
          <div className={`overall-chart-panel flex flex-col p-3.5 sm:p-4 rounded-xl border mt-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  Aggregate Network Bandwidth Timeline
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1 text-[#E41919]">
                  <span className="w-2 h-2 rounded-full bg-[#E41919]" />
                  Total Inbound
                </span>
                <span className={`flex items-center gap-1 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                  <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-500' : 'bg-[#FFCE00]'}`} />
                  Total Outbound
                </span>
              </div>
            </div>
            <OverallTrafficTimelineChart series={overallSeries} timeRange={timeRange} theme={printTheme} />
          </div>
        )}

        {/* All-Link Executive Summary Table */}
        {reportData && reportData.reports.length > 0 && (
          <div className={`cover-table-container overflow-x-auto rounded-xl border p-4 print:p-2.5 mt-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  All-Link Interface Utilization & Peering Overview
                </span>
              </div>
              <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {reportData.reports.length} Monitored Links
              </span>
            </div>

            <table className="w-full text-left text-xs font-mono print:text-[9px] print:font-mono border-collapse">
              <thead>
                <tr className={`border-b text-[10px] print:text-[9px] uppercase ${isLight ? 'border-slate-300 text-slate-500' : 'border-[#242E42] text-slate-500'}`}>
                  <th className="py-2 px-3 print:px-1.5 print:py-1">Interface</th>
                  <th className="py-2 px-2 print:px-1.5 print:py-1 text-center">Type</th>
                  <th className="py-2 px-3 print:px-1.5 print:py-1 text-right">Peak Inbound</th>
                  <th className="py-2 px-3 print:px-1.5 print:py-1 text-right">Peak Outbound</th>
                  <th className="py-2 px-3 print:px-1.5 print:py-1 text-right">Avg Inbound</th>
                  <th className="py-2 px-3 print:px-1.5 print:py-1 text-right">Avg Outbound</th>
                  <th className="py-2 px-3 print:px-1.5 print:py-1">Top Source ASN (#1 Talker)</th>
                </tr>
              </thead>
              <tbody>
                {reportData.reports.map((report) => {
                  const topAsn = report.top_asns && report.top_asns.length > 0 ? report.top_asns[0] : null
                  const isTransit = report.type === 'transit'
                  return (
                    <tr
                      key={report.interface_name}
                      className={`border-b transition-colors ${
                        isLight
                          ? 'border-slate-200 hover:bg-slate-100/60'
                          : 'border-[#1E2838]/60 hover:bg-[#161E2E]/60'
                      }`}
                    >
                      <td className={`py-2 px-3 print:px-1.5 print:py-1 whitespace-nowrap font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                        {report.interface_name}
                      </td>
                      <td className="py-2 px-2 print:px-1.5 print:py-1 text-center whitespace-nowrap">
                        <span
                          className={`text-[9px] font-mono uppercase px-2 py-0.5 print:px-1 print:py-0.5 rounded-full font-bold tracking-wider ${
                            isTransit
                              ? isLight
                                ? 'bg-red-100 text-red-700 border border-red-300'
                                : 'bg-[#E41919]/20 text-[#FCA5A5] border border-[#E41919]/35'
                              : isLight
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-[#FFCE00]/20 text-[#FFCE00] border border-[#FFCE00]/35'
                          }`}
                        >
                          {isTransit ? 'Transit' : 'IX'}
                        </span>
                      </td>
                      <td className="py-2 px-3 print:px-1.5 print:py-1 text-right font-bold text-[#E41919] whitespace-nowrap">
                        ↓ {formatMetric(report.summary.peak_inbound_bps, 'traffic')}
                      </td>
                      <td className={`py-2 px-3 print:px-1.5 print:py-1 text-right font-bold whitespace-nowrap ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                        ↑ {formatMetric(report.summary.peak_outbound_bps, 'traffic')}
                      </td>
                      <td className={`py-2 px-3 print:px-1.5 print:py-1 text-right font-medium whitespace-nowrap ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {formatMetric(report.summary.avg_inbound_bps, 'traffic')}
                      </td>
                      <td className={`py-2 px-3 print:px-1.5 print:py-1 text-right font-medium whitespace-nowrap ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {formatMetric(report.summary.avg_outbound_bps, 'traffic')}
                      </td>
                      <td className="py-2 px-3 print:px-1.5 print:py-1 whitespace-nowrap">
                        {topAsn ? (
                          <div className="flex items-center gap-1.5 print:gap-1">
                            <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {String(topAsn.asn).startsWith('AS') ? topAsn.asn : `AS${topAsn.asn}`}
                            </span>
                            <span
                              className={`text-[10px] print:text-[8.5px] truncate max-w-[110px] print:max-w-[85px] sm:max-w-[160px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
                              title={topAsn.org}
                            >
                              {topAsn.org}
                            </span>
                            <span className="text-[10px] print:text-[8.5px] text-[#E41919] font-bold">
                              ({topAsn.percent.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Page 2: Macro Peering Sankey Flow Page ────────────────────────────── */}
      {reportData && reportData.reports.length > 0 && (
        <div
          className={`report-sankey-page p-6 rounded-2xl border shadow-xl flex flex-col gap-4 ${
            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#161E2E] border-[#242E42] text-white'
          }`}
        >
          {/* Page Header */}
          <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-4 ${isLight ? 'border-slate-200' : 'border-[#242E42]'}`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E41919]" />
                <span className={`text-xs font-mono uppercase tracking-widest font-bold ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                  Macro Peering Topology & Ingress Flow
                </span>
              </div>
              <h2 className={`text-xl md:text-2xl font-bold tracking-tight m-0 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Inbound Peers → Local ISP Core → Outbound Peers
              </h2>
              <p className={`text-xs mt-1 mb-0 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                3-tier alluvial flow visualization mapping inbound origin peers through core ISP autonomous systems to outbound destination peers.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={`px-2.5 py-1 rounded-lg border ${isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#0B0F17] border-[#242E42] text-slate-300'}`}>
                Top Talkers Capped (6–8)
              </span>
              <span className={`px-2.5 py-1 rounded-lg border ${isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#0B0F17] border-[#242E42] text-slate-300'}`}>
                {reportData.reports.length} Monitored Links
              </span>
            </div>
          </div>

          {/* Sankey Flow Chart Panel */}
          <div className={`sankey-panel p-4 rounded-xl border flex flex-col ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
            {/* 3 Tier Column Headers */}
            <div className="grid grid-cols-3 text-xs font-mono uppercase font-bold tracking-wider mb-2 px-2">
              <div className={`flex items-center gap-2 ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>Inbound Origin Peers</span>
              </div>
              <div className={`flex items-center justify-center gap-2 text-[#E41919]`}>
                <span className="w-2 h-2 rounded-full bg-[#E41919]" />
                <span>Local ISP Core (VNT / Nomaden)</span>
              </div>
              <div className={`flex items-center justify-end gap-2 ${isLight ? 'text-amber-700' : 'text-[#FFCE00]'}`}>
                <span>Outbound Destination Peers</span>
                <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-500' : 'bg-[#FFCE00]'}`} />
              </div>
            </div>

            <div className="w-full h-[480px]">
              <MacroPeeringSankeyChart
                sankeyData={sankeyData}
                theme={printTheme}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Pages 2+: Per-Interface Cards ────────────────────────────────────── */}
      {loading && !reportData ? (
        <div className={`p-12 text-center rounded-2xl border ${isLight ? 'bg-white border-slate-300' : 'bg-[#161E2E] border-[#242E42]'}`}>
          <div className="w-8 h-8 mx-auto border-2 border-[#E41919] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-mono text-slate-400">Aggregating telemetry from ClickHouse clusters...</p>
        </div>
      ) : reportData?.reports.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${isLight ? 'bg-white border-slate-300' : 'bg-[#161E2E] border-[#242E42]'}`}>
          <p className="text-sm font-mono text-slate-400">No interfaces selected or matching criteria.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {reportData?.reports.map((report: InterfaceReportItem) => {
            const isTransit = report.type === 'transit'
            return (
              <div
                key={report.interface_name}
                className={`report-card p-4 sm:p-5 print:p-3 rounded-2xl border shadow-xl flex flex-col gap-3 print:gap-2 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#161E2E] border-[#242E42] text-white'
                }`}
              >
                {/* Interface Header */}
                <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2.5 print:pb-1.5 ${isLight ? 'border-slate-200' : 'border-[#242E42]'}`}>
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isTransit
                          ? 'bg-[#E41919] shadow-sm shadow-[#E41919]'
                          : isLight
                            ? 'bg-amber-500 shadow-sm shadow-amber-500'
                            : 'bg-[#FFCE00] shadow-sm shadow-[#FFCE00]'
                      }`}
                    />
                    <h2 className={`text-base md:text-lg font-mono font-bold tracking-tight m-0 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {report.interface_name}
                    </h2>
                    <span
                      className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded-full font-bold tracking-wider ${
                        isTransit
                          ? isLight
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : 'bg-[#E41919]/15 text-[#FCA5A5] border border-[#E41919]/35'
                          : isLight
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-[#FFCE00]/15 text-[#FFCE00] border border-[#FFCE00]/35'
                      }`}
                    >
                      {report.type === 'transit' ? 'Transit Upstream' : 'Internet Exchange (IX)'}
                    </span>
                  </div>

                  <div className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Resolution: <span className={isLight ? 'text-slate-800 font-semibold' : 'text-slate-200'}>{timeRange === '24h' ? '5m' : timeRange === '7d' ? '30m' : '1h'}</span>
                  </div>
                </div>

                {/* KPI Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-2.5 print:gap-2">
                  <div className={`metric-box p-2 sm:p-2.5 print:p-1.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Peak Inbound</span>
                      <span className="text-[11px] font-bold text-[#E41919]">↓ IN</span>
                    </div>
                    <div className="text-sm md:text-base font-mono font-bold text-[#E41919] mt-0.5">
                      {formatMetric(report.summary.peak_inbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className={`metric-box p-2 sm:p-2.5 print:p-1.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Peak Outbound</span>
                      <span className={`text-[11px] font-bold ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>↑ OUT</span>
                    </div>
                    <div className={`text-sm md:text-base font-mono font-bold mt-0.5 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                      {formatMetric(report.summary.peak_outbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className={`metric-box p-2 sm:p-2.5 print:p-1.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Average Inbound</span>
                    <div className={`text-sm md:text-base font-mono font-bold mt-0.5 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                      {formatMetric(report.summary.avg_inbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className={`metric-box p-2 sm:p-2.5 print:p-1.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Average Outbound</span>
                    <div className={`text-sm md:text-base font-mono font-bold mt-0.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      {formatMetric(report.summary.avg_outbound_bps, 'traffic')}
                    </div>
                  </div>
                </div>

                {/* Vertical Stack: 1st Timeline Card, 2nd Top 10 Talker ASN Table Card */}
                <div className="flex flex-col gap-3 print:gap-2">
                  {/* 1st: Full-width Timeline Card */}
                  <div className={`chart-panel w-full flex flex-col p-3 print:p-2 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                        <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          Throughput Utilization Timeline
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="flex items-center gap-1 text-[#E41919] font-semibold">
                          <span className="w-2 h-2 rounded-full bg-[#E41919]" />
                          Inbound
                        </span>
                        <span className={`flex items-center gap-1 font-semibold ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                          <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-500' : 'bg-[#FFCE00]'}`} />
                          Outbound
                        </span>
                      </div>
                    </div>
                    <div className="w-full">
                      <InterfaceTimelineChart series={report.series} timeRange={timeRange} theme={printTheme} />
                    </div>
                  </div>

                  {/* 2nd: Full-width Top 10 Talker ASN Table Card below the graph */}
                  <div className={`asn-panel w-full flex flex-col p-3 print:p-2 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          Top 10 Talker Source ASNs (Inbound)
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>By Ingress Volume</span>
                    </div>

                    <div className="overflow-x-auto min-w-0">
                      <table className="w-full text-left text-xs font-mono print:text-[8.5px] print:font-mono border-collapse">
                        <thead>
                          <tr className={`border-b text-[10px] print:text-[8px] uppercase tracking-wider font-semibold ${isLight ? 'border-slate-300 text-slate-500' : 'border-[#242E42] text-slate-400'}`}>
                            <th className="py-1 px-2 print:px-1 print:py-0.5 w-7 text-center">#</th>
                            <th className="py-1 px-3 print:px-1.5 print:py-0.5">Source ASN & Organization</th>
                            <th className="py-1 px-3 print:px-1.5 print:py-0.5 text-right w-28 print:w-20">Bitrate</th>
                            <th className="py-1 px-3 print:px-1.5 print:py-0.5 text-right w-44 print:w-32">% Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.top_asns.slice(0, 10).map((asn, idx) => (
                            <tr
                              key={asn.asn}
                              className={`asn-row border-b transition-colors ${
                                isLight
                                  ? 'border-slate-200 hover:bg-slate-100/60'
                                  : 'border-[#1E2838]/60 hover:bg-[#161E2E]/60'
                              }`}
                            >
                              <td className={`py-1 print:py-0.5 px-2 print:px-1 text-center font-bold ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                                {idx === 0 ? (
                                  <span className={isLight ? 'text-amber-600' : 'text-[#FFCE00]'}>1</span>
                                ) : idx === 1 ? (
                                  <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>2</span>
                                ) : idx === 2 ? (
                                  <span className="text-[#E41919]">3</span>
                                ) : (
                                  idx + 1
                                )}
                              </td>
                              <td className="py-1 print:py-0.5 px-3 print:px-1.5">
                                <div className="flex items-center gap-2">
                                  <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                                    {asn.asn}
                                  </span>
                                  {asn.org && (
                                    <span
                                      className={`text-[11px] print:text-[8px] truncate max-w-[280px] print:max-w-[220px] sm:max-w-[440px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
                                      title={asn.org}
                                    >
                                      – {asn.org}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className={`py-1 print:py-0.5 px-3 print:px-1.5 text-right font-bold whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                {formatMetric(asn.bps, 'traffic')}
                              </td>
                              <td className="py-1 print:py-0.5 px-3 print:px-1.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-3 print:gap-2">
                                  <span className="text-[11px] print:text-[8px] font-bold text-[#E41919] w-12 print:w-9 text-right">
                                    {asn.percent.toFixed(1)}%
                                  </span>
                                  <div className={`w-28 print:w-20 h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-[#242E42]'}`}>
                                    <div
                                      className="h-full bg-gradient-to-r from-[#E41919] to-[#FFCE00] rounded-full"
                                      style={{ width: `${Math.min(100, Math.max(3, asn.percent))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

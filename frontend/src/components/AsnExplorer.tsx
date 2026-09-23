import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import {
  getAsnDetail,
  type AsnDetailResponse,
  type Interface,
} from '../api/client'
import {
  formatBps,
  KNOWN_ASNS,
} from '../data/mock'

type Props = {
  interfaces: Interface[]
  allPrefixes?: string[]
  theme?: 'dark' | 'light'
}

const TOP_TALKER_CHIPS = [
  { asn: 'AS15169', name: 'Google' },
  { asn: 'AS32934', name: 'Meta' },
  { asn: 'AS13335', name: 'Cloudflare' },
  { asn: 'AS20940', name: 'Akamai' },
  { asn: 'AS58389', name: 'PT Telkom' },
  { asn: 'AS714', name: 'Apple' },
  { asn: 'AS139057', name: 'Edgenext' },
]

const TIME_RANGES = ['15m', '1h', '6h', '24h', '7d']

// Strict static color mapping by interface
function getInterfaceColor(ifaceName: string): string {
  const norm = ifaceName.toUpperCase().trim()
  if (norm === 'IPT.CBN') return '#E41919'
  if (norm === 'IPT.IFORTE') return '#F87171'
  if (norm === 'IPT.NTT-SGCC') return '#DC2626'
  if (norm === 'IPT.SDI') return '#EF4444'
  if (norm === 'IPT.TELKOM') return '#B91C1C'

  if (norm.includes('OIXP')) return '#FFCE00'
  if (norm.includes('IIX')) return '#F59E0B'
  if (norm.includes('JKT-IX')) return '#FBBF24'
  if (norm.includes('CDIX')) return '#D97706'
  if (norm.includes('DE-CIX')) return '#FCD34D'

  if (norm.startsWith('IPT.') || norm.startsWith('IPT')) return '#991B1B'
  if (norm.startsWith('LC.') || norm.startsWith('IX.') || norm.startsWith('IX')) return '#B45309'

  return '#E41919'
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function computeUnitScale(peakVal: number) {
  if (peakVal >= 1e12) return { divisor: 1e12, unit: 'Tbps' }
  if (peakVal >= 1e9) return { divisor: 1e9, unit: 'Gbps' }
  if (peakVal >= 1e6) return { divisor: 1e6, unit: 'Mbps' }
  if (peakVal >= 1e3) return { divisor: 1e3, unit: 'Kbps' }
  return { divisor: 1, unit: 'bps' }
}

export default function AsnExplorer({ interfaces, allPrefixes = [], theme = 'dark' }: Props) {
  const isLight = theme === 'light'
  const [selectedAsn, setSelectedAsn] = useState('AS15169')
  const [searchInput, setSearchInput] = useState('')
  const [timeRange, setTimeRange] = useState('1h')
  const [data, setData] = useState<AsnDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Fetch ASN details
  const fetchData = useCallback(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    getAsnDetail({ asn: selectedAsn, time_range: timeRange }, interfaces, allPrefixes)
      .then((res) => {
        if (active) setData(res)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedAsn, timeRange, interfaces, allPrefixes])

  useEffect(() => {
    return fetchData()
  }, [fetchData])

  // Filtered ASN suggestions for search box
  const searchSuggestions = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) return []
    return Object.entries(KNOWN_ASNS)
      .filter(([asn, org]) => asn.toLowerCase().includes(q) || org.toLowerCase().includes(q))
      .slice(0, 8)
  }, [searchInput])

  const handleSelectAsn = (asn: string) => {
    const norm = asn.toUpperCase().startsWith('AS') ? asn.toUpperCase() : `AS${asn}`
    setSelectedAsn(norm)
    setSearchInput('')
    setIsDropdownOpen(false)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = searchInput.trim()
    if (!trimmed) return
    const matched = Object.entries(KNOWN_ASNS).find(
      ([asn, org]) =>
        asn.toLowerCase() === trimmed.toLowerCase() ||
        asn.toLowerCase() === `as${trimmed.toLowerCase()}` ||
        org.toLowerCase().includes(trimmed.toLowerCase())
    )
    if (matched) {
      handleSelectAsn(matched[0])
    } else {
      handleSelectAsn(trimmed)
    }
  }

  // Active interfaces present in series
  const seriesIfaces = useMemo(() => {
    if (!data || !data.series || data.series.length === 0) return []
    const set = new Set<string>()
    data.series.forEach((pt) => {
      Object.keys(pt.interfaces).forEach((k) => set.add(k))
    })
    return Array.from(set).sort()
  }, [data])

  // Peak aggregate bitrate for chart scale
  const peakVal = useMemo(() => {
    if (!data?.series || data.series.length === 0) return 0
    return Math.max(...data.series.map((pt) => pt.total_bps))
  }, [data])

  const scale = useMemo(() => computeUnitScale(peakVal), [peakVal])

  // Stacked Area Chart options
  const chartOption = useMemo(() => {
    if (!data?.series || data.series.length === 0) {
      return {
        backgroundColor: 'transparent',
        series: [],
      }
    }

    const timeLabels = data.series.map((pt) => {
      const d = new Date(pt.timestamp)
      if (timeRange === '24h' || timeRange === '7d') {
        return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      }
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })

    const chartSeries = seriesIfaces.map((iface) => {
      const color = getInterfaceColor(iface)
      const isTransit = iface.startsWith('IPT')
      return {
        name: iface,
        type: 'line',
        stack: 'Total',
        smooth: true,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 1.5,
          color: color,
        },
        itemStyle: {
          color: color,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexToRgba(color, isTransit ? 0.7 : 0.6) },
            { offset: 1, color: hexToRgba(color, 0.04) },
          ]),
        },
        data: data.series.map((pt) => {
          const bps = pt.interfaces[iface] || 0
          return parseFloat((bps / scale.divisor).toFixed(2))
        }),
      }
    })

    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 500,
      grid: {
        top: 36,
        right: 20,
        bottom: 24,
        left: 56,
        containLabel: false,
      },
      legend: {
        show: true,
        top: 0,
        right: 12,
        textStyle: {
          color: isLight ? '#334155' : '#94A3B8',
          fontSize: 11,
          fontFamily: 'monospace',
        },
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 14,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 30, 46, 0.95)',
        borderColor: isLight ? '#CBD5E1' : '#242E42',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: isLight ? '#0F172A' : '#F8FAFC',
          fontSize: 12,
        },
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: isLight ? '#D97706' : '#FFCE00',
            type: 'dashed',
            width: 1,
          },
          crossStyle: {
            color: isLight ? '#D97706' : '#FFCE00',
          },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const time = params[0].axisValueLabel
          let totalScaled = 0
          const items: { name: string; val: number; color: string; isTransit: boolean }[] = []

          params.forEach((p: any) => {
            const val = typeof p.value === 'number' ? p.value : 0
            totalScaled += val
            const isTransit = p.seriesName.startsWith('IPT')
            items.push({
              name: p.seriesName,
              val,
              color: p.color,
              isTransit,
            })
          })

          // Sort items descending by value
          items.sort((a, b) => b.val - a.val)

          const totalBps = totalScaled * scale.divisor

          let html = `
            <div style="font-family: monospace; min-width: 240px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${isLight ? '#E2E8F0' : '#242E42'}; padding-bottom: 6px; margin-bottom: 8px;">
                <span style="color: ${isLight ? '#475569' : '#94A3B8'}; font-size: 11px;">${time}</span>
                <span style="color: ${isLight ? '#D97706' : '#FFCE00'}; font-weight: bold; font-size: 12px;">Total: ${formatBps(totalBps)}</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          `

          items.forEach((item) => {
            const bps = item.val * scale.divisor
            const pct = totalScaled > 0 ? ((item.val / totalScaled) * 100).toFixed(1) : '0.0'
            const badgeBg = item.isTransit
              ? (isLight ? 'rgba(228, 25, 25, 0.1)' : 'rgba(228, 25, 25, 0.15)')
              : (isLight ? 'rgba(217, 119, 6, 0.12)' : 'rgba(255, 206, 0, 0.15)')
            const badgeText = item.isTransit ? (isLight ? '#DC2626' : '#FCA5A5') : (isLight ? '#B45309' : '#FDE68A')
            const badgeLabel = item.isTransit ? 'IPT' : 'IX'

            html += `
              <tr style="height: 22px;">
                <td style="padding: 2px 4px 2px 0;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${item.color}; margin-right: 6px;"></span>
                  <span style="color: ${isLight ? '#0F172A' : '#E2E8F0'}; font-weight: 500;">${item.name}</span>
                </td>
                <td style="padding: 2px 6px; text-align: center;">
                  <span style="background: ${badgeBg}; color: ${badgeText}; border-radius: 3px; padding: 1px 4px; font-size: 9px; font-weight: 600;">${badgeLabel}</span>
                </td>
                <td style="padding: 2px 0 2px 6px; text-align: right; color: ${isLight ? '#0F172A' : '#F8FAFC'}; font-weight: bold;">
                  ${formatBps(bps)}
                </td>
                <td style="padding: 2px 0 2px 8px; text-align: right; color: ${isLight ? '#475569' : '#94A3B8'}; font-size: 10px;">
                  ${pct}%
                </td>
              </tr>
            `
          })

          html += `</table></div>`
          return html
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timeLabels,
        axisLine: { lineStyle: { color: isLight ? '#CBD5E1' : '#242E42' } },
        axisTick: { show: false },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'monospace',
          margin: 12,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: {
            color: isLight ? '#E2E8F0' : '#161E2E',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'monospace',
          formatter: (v: number) => `${v} ${scale.unit}`,
        },
      },
      series: chartSeries,
    }
  }, [data, seriesIfaces, scale, timeRange, isLight])

  const summary = data?.summary
  const totalBps = summary ? summary.total_bps : 0
  const inBps = summary ? summary.current_inbound_bps : 0
  const outBps = summary ? summary.current_outbound_bps : 0
  const inPct = totalBps > 0 ? Math.round((inBps / totalBps) * 100) : 50
  const outPct = 100 - inPct
  const transitPct = summary ? summary.transit_percent : 0
  const ixPct = summary ? summary.ix_percent : 0

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* 1. Target ASN Selector & Telemetry Command Bar */}
      <div className="p-4 rounded-xl bg-[#161E2E] border border-[#242E42] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Search input & Active Target */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative w-full sm:w-80">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value)
                  setIsDropdownOpen(true)
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Search ASN or Org (e.g. 15169, Meta)..."
                className="w-full pl-9 pr-8 py-2 bg-[#0B0F17] border border-[#242E42] rounded-lg text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#E41919] transition-colors"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    setIsDropdownOpen(false)
                  }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </form>

            {/* Autocomplete dropdown */}
            {isDropdownOpen && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#161E2E] border border-[#242E42] rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {searchSuggestions.map(([asn, org]) => (
                  <button
                    key={asn}
                    type="button"
                    onClick={() => handleSelectAsn(asn)}
                    className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-[#242E42]/60 transition-colors border-b border-[#242E42]/40 last:border-0"
                  >
                    <span className="font-mono text-xs font-bold text-[#FFCE00]">{asn}</span>
                    <span className="text-xs text-slate-300 truncate max-w-[180px]">{org}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current Target Chip */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0B0F17] border border-[#E41919]/40 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-[#E41919] animate-pulse"></span>
            <span className="font-mono text-xs font-bold text-white">{data?.asn || selectedAsn}</span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-xs font-medium text-slate-200 truncate max-w-[220px]">
              {data?.org || KNOWN_ASNS[selectedAsn] || 'Autonomous System'}
            </span>
          </div>
        </div>

        {/* Right: Time Range & Refresh Button */}
        <div className="flex items-center gap-3">
          {/* Time range picker */}
          <div className="flex items-center bg-[#0B0F17] p-1 rounded-lg border border-[#242E42]">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => setTimeRange(tr)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  timeRange === tr
                    ? 'bg-[#E41919] text-white font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tr}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B0F17] hover:bg-[#242E42] border border-[#242E42] rounded-lg text-xs font-mono text-slate-200 transition-colors disabled:opacity-50"
            title="Reload ASN Telemetry"
          >
            <svg
              className={`w-3.5 h-3.5 text-[#FFCE00] ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
        <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider shrink-0 mr-1">
          Top Remote ASNs:
        </span>
        {TOP_TALKER_CHIPS.map((chip) => {
          const isCurrent = (data?.asn || selectedAsn) === chip.asn
          return (
            <button
              key={chip.asn}
              type="button"
              onClick={() => handleSelectAsn(chip.asn)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono shrink-0 transition-all border ${
                isCurrent
                  ? 'bg-[#E41919] text-white border-[#E41919] font-bold shadow-md shadow-[#E41919]/20'
                  : 'bg-[#161E2E] text-slate-300 border-[#242E42] hover:border-slate-500 hover:text-white'
              }`}
            >
              <span className={isCurrent ? 'text-white' : 'text-[#FFCE00]'}>{chip.asn}</span>
              <span className="text-slate-400">·</span>
              <span>{chip.name}</span>
            </button>
          )
        })}
      </div>

      {/* 2. Selected ASN Summary Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Bandwidth */}
        <div className="p-4 rounded-xl bg-[#161E2E] border border-[#242E42] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Total ASN Bandwidth
            </span>
            <span className="p-1 rounded bg-[#E41919]/10 text-[#E41919]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-2xl font-bold text-white tracking-tight">
              {formatBps(totalBps)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-[#242E42]/60 pt-2">
            <span>Peak In Window:</span>
            <span className="text-[#FFCE00] font-bold">
              {formatBps((summary?.peak_inbound_bps || 0) + (summary?.peak_outbound_bps || 0))}
            </span>
          </div>
        </div>

        {/* KPI 2: Ingress vs Egress Split */}
        <div className="p-4 rounded-xl bg-[#161E2E] border border-[#242E42] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Ingress / Egress Split
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              IN {inPct}% / OUT {outPct}%
            </span>
          </div>
          {/* Progress split bar */}
          <div className="my-2">
            <div className="w-full h-2 rounded-full bg-[#0B0F17] overflow-hidden flex">
              <div
                className="h-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${inPct}%` }}
                title={`Inbound: ${inPct}%`}
              />
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${outPct}%` }}
                title={`Outbound: ${outPct}%`}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono border-t border-[#242E42]/60 pt-2">
            <div className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
              <span>In: {formatBps(inBps)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Out: {formatBps(outBps)}</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Transit vs IX Distribution */}
        <div className="p-4 rounded-xl bg-[#161E2E] border border-[#242E42] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Transit vs IX Peering
            </span>
            <span className="text-[10px] font-mono font-bold text-[#FFCE00]">
              IPT {transitPct}% · IX {ixPct}%
            </span>
          </div>
          {/* Distribution bar */}
          <div className="my-2">
            <div className="w-full h-2 rounded-full bg-[#0B0F17] overflow-hidden flex">
              <div
                className="h-full bg-[#E41919] transition-all duration-500"
                style={{ width: `${transitPct}%` }}
                title={`Transit: ${transitPct}%`}
              />
              <div
                className="h-full bg-[#FFCE00] transition-all duration-500"
                style={{ width: `${ixPct}%` }}
                title={`IX Peering: ${ixPct}%`}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono border-t border-[#242E42]/60 pt-2">
            <div className="flex items-center gap-1.5 text-[#FCA5A5]">
              <span className="w-2 h-2 rounded-full bg-[#E41919]"></span>
              <span>IPT: {formatBps(summary?.transit_bps || 0)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#FDE68A]">
              <span className="w-2 h-2 rounded-full bg-[#FFCE00]"></span>
              <span>IX: {formatBps(summary?.ix_bps || 0)}</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Active Interface Carrier Matrix */}
        <div className="p-4 rounded-xl bg-[#161E2E] border border-[#242E42] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Active Interfaces
            </span>
            <span className="text-[11px] font-mono font-bold text-white px-2 py-0.5 rounded bg-[#0B0F17] border border-[#242E42]">
              {summary?.active_interfaces?.length || 0} Carriers
            </span>
          </div>
          <div className="my-2 flex flex-wrap gap-1.5 max-h-12 overflow-y-auto">
            {summary?.active_interfaces && summary.active_interfaces.length > 0 ? (
              summary.active_interfaces.map((iface) => {
                const isTransit = iface.startsWith('IPT')
                const color = getInterfaceColor(iface)
                return (
                  <span
                    key={iface}
                    style={{ borderColor: hexToRgba(color, 0.4), color: color }}
                    className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#0B0F17] border"
                  >
                    {isTransit ? 'IPT: ' : 'IX: '}
                    {iface}
                  </span>
                )
              })
            ) : (
              <span className="text-xs text-slate-500 font-mono">No carriers active</span>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-[#242E42]/60 pt-2">
            <span>Color code:</span>
            <span className="flex items-center gap-2 text-[10px]">
              <span className="text-[#E41919]">● Transit (Red)</span>
              <span className="text-[#FFCE00]">● IX (Gold)</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Full-Width Stacked Area Chart */}
      <div className="p-5 rounded-xl bg-[#161E2E] border border-[#242E42] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>Traffic Over Time by Interface (Stacked Area)</span>
              <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-[#0B0F17] text-[#FFCE00] border border-[#242E42]">
                {data?.asn || selectedAsn}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Breakdown of incoming & outgoing traffic across upstream transit providers and peering exchanges.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#E41919]"></span>
              <span>Transit (IPT)</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#FFCE00]"></span>
              <span>Peering (IX)</span>
            </span>
          </div>
        </div>

        {/* ECharts Stacked Area Canvas */}
        <div className="w-full h-80">
          <ReactECharts
            option={chartOption}
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
      </div>

      {/* 4. Local Subnet Impact Table */}
      <div className="rounded-xl bg-[#161E2E] border border-[#242E42] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#242E42] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Local ISP Subnet Breakdown & Impact
            </h3>
            <p className="text-xs text-slate-400">
              Local CIDR prefixes exchanging traffic with {data?.asn || selectedAsn} ({data?.org || 'Autonomous System'}).
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {data?.subnets?.length || 0} Subnets Listed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0B0F17] text-[11px] font-mono uppercase tracking-wider text-slate-400 border-b border-[#242E42]">
                <th className="py-3 px-4">Local Subnet (CIDR)</th>
                <th className="py-3 px-4 text-right">Inbound (bps)</th>
                <th className="py-3 px-4 text-right">Outbound (bps)</th>
                <th className="py-3 px-4 text-right">Total Bandwidth</th>
                <th className="py-3 px-4">Traffic Share (%)</th>
                <th className="py-3 px-4 text-center">Dominant Interface</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242E42]/60 text-xs font-mono">
              {data?.subnets && data.subnets.length > 0 ? (
                data.subnets.map((sub, idx) => {
                  const ifaceColor = getInterfaceColor(sub.dominant_interface)
                  const isTransit = sub.dominant_interface.startsWith('IPT')
                  return (
                    <tr
                      key={sub.cidr + idx}
                      className="hover:bg-[#0B0F17]/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#E41919]"></span>
                        <span>{sub.cidr}</span>
                      </td>
                      <td className="py-3 px-4 text-right text-cyan-400">
                        {formatBps(sub.inbound_bps)}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-400">
                        {formatBps(sub.outbound_bps)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-white">
                        {formatBps(sub.total_bps)}
                      </td>
                      <td className="py-3 px-4 w-48">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[#0B0F17] overflow-hidden">
                            <div
                              className="h-full bg-[#E41919] rounded-full"
                              style={{ width: `${Math.min(100, sub.percent)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-300 w-10 text-right">
                            {sub.percent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          style={{
                            borderColor: hexToRgba(ifaceColor, 0.5),
                            color: ifaceColor,
                          }}
                          className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#0B0F17] border"
                        >
                          {isTransit ? 'IPT · ' : 'IX · '}
                          {sub.dominant_interface}
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                    No subnet flow telemetry recorded for this ASN in the selected window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

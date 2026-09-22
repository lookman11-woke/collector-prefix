import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  getInterfaceReports,
  type Interface,
  type InterfaceReportResponse,
  type InterfaceReportItem,
  type InterfaceReportPoint,
} from '../api/client'
import { formatMetric } from '../data/mock'

type Props = {
  interfaces: Interface[]
}

function computeUnitScale(peakVal: number) {
  if (peakVal >= 1e12) return { divisor: 1e12, unit: 'Tbps', unitShort: 'T' }
  if (peakVal >= 1e9) return { divisor: 1e9, unit: 'Gbps', unitShort: 'G' }
  if (peakVal >= 1e6) return { divisor: 1e6, unit: 'Mbps', unitShort: 'M' }
  if (peakVal >= 1e3) return { divisor: 1e3, unit: 'Kbps', unitShort: 'K' }
  return { divisor: 1, unit: 'bps', unitShort: '' }
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
    <div className="w-full h-[220px]">
      <ReactECharts option={option} style={{ width: '100%', height: '100%' }} notMerge />
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

export default function ReportView({ interfaces }: Props) {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(
    () => new Set(interfaces.map((i) => i.id))
  )
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<InterfaceReportResponse | null>(null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [printTheme, setPrintTheme] = useState<'dark' | 'light'>('dark')

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const ifaceList = Array.from(selectedInterfaces)
      const data = await getInterfaceReports(
        {
          time_range: timeRange,
          interfaces: ifaceList,
        },
        interfaces
      )
      setReportData(data)
      setGeneratedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [timeRange, selectedInterfaces, interfaces])

  useEffect(() => {
    let active = true
    void getInterfaceReports(
      {
        time_range: timeRange,
        interfaces: Array.from(selectedInterfaces),
      },
      interfaces
    ).then((data) => {
      if (active) {
        setReportData(data)
        setGeneratedAt(new Date())
      }
    })
    return () => {
      active = false
    }
  }, [timeRange, selectedInterfaces, interfaces])

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
          /* Theme-specific styles for sub-boxes, tables, and borders */
          ${isLight ? `
            .metric-box, .chart-panel, .asn-panel, .cover-table-container {
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
              onClick={() => setPrintTheme('dark')}
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
              onClick={() => setPrintTheme('light')}
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

        {/* All-Link Executive Summary Table */}
        {reportData && reportData.reports.length > 0 && (
          <div className={`cover-table-container overflow-x-auto rounded-xl border p-4 mt-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
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

            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className={`border-b text-[10px] uppercase ${isLight ? 'border-slate-300 text-slate-500' : 'border-[#242E42] text-slate-500'}`}>
                  <th className="py-2 px-3">Interface</th>
                  <th className="py-2 px-2 text-center">Type</th>
                  <th className="py-2 px-3 text-right">Peak Inbound</th>
                  <th className="py-2 px-3 text-right">Peak Outbound</th>
                  <th className="py-2 px-3 text-right">Avg Inbound</th>
                  <th className="py-2 px-3 text-right">Avg Outbound</th>
                  <th className="py-2 px-3">Top Source ASN (#1 Talker)</th>
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
                      <td className={`py-2 px-3 whitespace-nowrap font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                        {report.interface_name}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <span
                          className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full font-bold tracking-wider ${
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
                      <td className="py-2 px-3 text-right font-bold text-[#E41919] whitespace-nowrap">
                        ↓ {formatMetric(report.summary.peak_inbound_bps, 'traffic')}
                      </td>
                      <td className={`py-2 px-3 text-right font-bold whitespace-nowrap ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                        ↑ {formatMetric(report.summary.peak_outbound_bps, 'traffic')}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium whitespace-nowrap ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {formatMetric(report.summary.avg_inbound_bps, 'traffic')}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium whitespace-nowrap ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {formatMetric(report.summary.avg_outbound_bps, 'traffic')}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {topAsn ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              AS{topAsn.asn}
                            </span>
                            <span
                              className={`text-[10px] truncate max-w-[120px] sm:max-w-[160px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
                              title={topAsn.org}
                            >
                              {topAsn.org}
                            </span>
                            <span className="text-[10px] text-[#E41919] font-bold">
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
                className={`report-card p-5 sm:p-6 print:p-4 rounded-2xl border shadow-xl flex flex-col gap-4 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#161E2E] border-[#242E42] text-white'
                }`}
              >
                {/* Interface Header */}
                <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3.5 ${isLight ? 'border-slate-200' : 'border-[#242E42]'}`}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isTransit
                          ? 'bg-[#E41919] shadow-sm shadow-[#E41919]'
                          : isLight
                            ? 'bg-amber-500 shadow-sm shadow-amber-500'
                            : 'bg-[#FFCE00] shadow-sm shadow-[#FFCE00]'
                      }`}
                    />
                    <h2 className={`text-lg md:text-xl font-mono font-bold tracking-tight m-0 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {report.interface_name}
                    </h2>
                    <span
                      className={`text-xs font-mono uppercase px-2.5 py-0.5 rounded-full font-bold tracking-wider ${
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
                <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-3">
                  <div className={`metric-box p-2.5 sm:p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Peak Inbound</span>
                      <span className="text-xs font-bold text-[#E41919]">↓ IN</span>
                    </div>
                    <div className="text-base md:text-lg font-mono font-bold text-[#E41919] mt-1">
                      {formatMetric(report.summary.peak_inbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className={`metric-box p-2.5 sm:p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Peak Outbound</span>
                      <span className={`text-xs font-bold ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>↑ OUT</span>
                    </div>
                    <div className={`text-base md:text-lg font-mono font-bold mt-1 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                      {formatMetric(report.summary.peak_outbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className={`metric-box p-2.5 sm:p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <span className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Average Inbound</span>
                    <div className={`text-base md:text-lg font-mono font-bold mt-1 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                      {formatMetric(report.summary.avg_inbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className={`metric-box p-2.5 sm:p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <span className={`text-[11px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Average Outbound</span>
                    <div className={`text-base md:text-lg font-mono font-bold mt-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      {formatMetric(report.summary.avg_outbound_bps, 'traffic')}
                    </div>
                  </div>
                </div>

                {/* Split Layout: Left = ECharts Timeline (220px), Right = Top 10 ASNs Table */}
                <div className="grid grid-cols-1 lg:grid-cols-12 print:grid-cols-12 gap-4 items-stretch">
                  {/* Left Column: Timeline */}
                  <div className={`chart-panel lg:col-span-7 print:col-span-7 flex flex-col p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                        <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          Throughput Utilization Timeline
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="flex items-center gap-1 text-[#E41919]">
                          <span className="w-2 h-2 rounded-full bg-[#E41919]" />
                          Inbound
                        </span>
                        <span className={`flex items-center gap-1 ${isLight ? 'text-amber-600' : 'text-[#FFCE00]'}`}>
                          <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-500' : 'bg-[#FFCE00]'}`} />
                          Outbound
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center">
                      <InterfaceTimelineChart series={report.series} timeRange={timeRange} theme={printTheme} />
                    </div>
                  </div>

                  {/* Right Column: Top 10 ASNs */}
                  <div className={`asn-panel lg:col-span-5 print:col-span-5 flex flex-col p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17] border-[#242E42]'}`}>
                    <div className="flex items-center justify-between mb-2">
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

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead>
                          <tr className={`border-b text-[10px] uppercase ${isLight ? 'border-slate-300 text-slate-500' : 'border-[#242E42] text-slate-500'}`}>
                            <th className="py-1 px-1.5 w-7 text-center">#</th>
                            <th className="py-1 px-2">Source ASN & Org</th>
                            <th className="py-1 px-2 text-right">Bitrate</th>
                            <th className="py-1 px-2 text-right w-24">% Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.top_asns.map((asn, idx) => (
                            <tr
                              key={asn.asn}
                              className={`asn-row border-b transition-colors ${
                                isLight
                                  ? 'border-slate-200 hover:bg-slate-100/60'
                                  : 'border-[#1E2838]/60 hover:bg-[#161E2E]/60'
                              }`}
                            >
                              <td className={`py-1 px-1.5 text-center font-bold ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
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
                              <td className="py-1 px-2">
                                <div className={`font-bold leading-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                                  {asn.asn}
                                </div>
                                <div
                                  className={`text-[10px] truncate max-w-[130px] sm:max-w-[180px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
                                  title={asn.org}
                                >
                                  {asn.org}
                                </div>
                              </td>
                              <td className={`py-1 px-2 text-right font-bold whitespace-nowrap ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                {formatMetric(asn.bps, 'traffic')}
                              </td>
                              <td className="py-1 px-2 text-right whitespace-nowrap">
                                <div className="flex flex-col items-end">
                                  <span className="text-[11px] font-bold text-[#E41919]">
                                    {asn.percent.toFixed(1)}%
                                  </span>
                                  <div className={`w-16 h-1 rounded-full overflow-hidden mt-0.5 ${isLight ? 'bg-slate-200' : 'bg-[#242E42]'}`}>
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

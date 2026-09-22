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
}: {
  series: InterfaceReportPoint[]
  timeRange: string
}) {
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
          color: '#94A3B8',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        itemWidth: 12,
        itemHeight: 8,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22, 30, 46, 0.96)',
        borderColor: '#242E42',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: '#F1F5F9',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any[]) => {
          const t = params[0]?.axisValue ?? ''
          const rows = (params || [])
            .map((p: any) => {
              const color = p.seriesName === 'Inbound (Ingress)' ? '#E41919' : '#FFCE00'
              return `
                <div style="display:flex; justify-content:space-between; gap:14px; margin-top:2px;">
                  <span style="color:${color}; font-weight:600;">${p.seriesName}:</span>
                  <span style="font-weight:700; color:#FFFFFF;">${p.value} ${scale.unit}</span>
                </div>
              `
            })
            .join('')
          return `
            <div style="font-size:11px; font-family:JetBrains Mono, monospace;">
              <div style="color:#64748B; margin-bottom:4px; font-weight:600; border-bottom:1px solid #242E42; padding-bottom:2px;">Time: ${t}</div>
              ${rows}
            </div>
          `
        },
        axisPointer: {
          type: 'line',
          lineStyle: { color: 'rgba(228, 25, 25, 0.4)', type: 'dashed', width: 1 },
        },
      },
      xAxis: {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#242E42' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748B',
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
          color: '#FFCE00',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          padding: [0, 0, 2, 0],
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (v: number) => `${v}${scale.unitShort}`,
        },
        splitLine: { lineStyle: { color: 'rgba(36, 46, 66, 0.6)', type: 'dashed' } },
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
                { offset: 0, color: 'rgba(228, 25, 25, 0.32)' },
                { offset: 1, color: 'rgba(228, 25, 25, 0.01)' },
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
          lineStyle: { color: '#FFCE00', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255, 206, 0, 0.28)' },
                { offset: 1, color: 'rgba(255, 206, 0, 0.01)' },
              ],
            },
          },
        },
      ],
    }
  }, [times, inSeries, outSeries, scale])

  return (
    <div className="w-full h-[250px]">
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
    void fetchReport()
  }, [fetchReport])

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

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12 report-canvas">
      {/* Embedded Print CSS to guarantee clean printable output */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body {
            background-color: #0B0F17 !important;
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
          }
          .report-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 20px !important;
          }
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
                              ? 'bg-[#E41919]/20 text-[#FCA5A5] border border-[#E41919]/30'
                              : 'bg-[#FFCE00]/20 text-[#FFCE00] border border-[#FFCE00]/30'
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

      {/* ── Document Header ──────────────────────────────────────────────────── */}
      <div className="p-6 rounded-2xl bg-[#161E2E] border border-[#242E42] shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#242E42] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E41919] animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#FFCE00] font-bold">
                Operational Telemetry Report
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white m-0">
              ISP Bandwidth Utilization & Peering Report
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1 mb-0">
              Granular link throughput, ingress/egress peak analysis, and Top 10 Talker Source ASN distribution.
            </p>
          </div>

          <div className="flex flex-col sm:items-end text-xs font-mono text-slate-300 gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Generated:</span>
              <span className="text-white font-medium">
                {generatedAt ? generatedAt.toUTCString() : 'Just now'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Time Range:</span>
              <span className="text-[#FFCE00] font-bold">
                {timeRange === '24h' ? 'Last 24 Hours' : timeRange === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Reporting Scope:</span>
              <span className="text-[#FCA5A5] font-semibold">
                {reportData?.reports.length || 0} Interfaces Selected
              </span>
            </div>
          </div>
        </div>

        {/* Executive Summary Numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5">
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-[#242E42]">
            <div className="text-[11px] font-mono text-slate-400">Total Peak Ingress</div>
            <div className="text-lg md:text-xl font-mono font-bold text-[#E41919] mt-0.5">
              {formatMetric(totals.totalPeakIn, 'traffic')}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-[#242E42]">
            <div className="text-[11px] font-mono text-slate-400">Total Peak Egress</div>
            <div className="text-lg md:text-xl font-mono font-bold text-[#FFCE00] mt-0.5">
              {formatMetric(totals.totalPeakOut, 'traffic')}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-[#242E42]">
            <div className="text-[11px] font-mono text-slate-400">Total Average Ingress</div>
            <div className="text-lg md:text-xl font-mono font-bold text-slate-100 mt-0.5">
              {formatMetric(totals.totalAvgIn, 'traffic')}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-[#242E42]">
            <div className="text-[11px] font-mono text-slate-400">Total Average Egress</div>
            <div className="text-lg md:text-xl font-mono font-bold text-slate-300 mt-0.5">
              {formatMetric(totals.totalAvgOut, 'traffic')}
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-Interface Cards ──────────────────────────────────────────────── */}
      {loading && !reportData ? (
        <div className="p-12 text-center rounded-2xl bg-[#161E2E] border border-[#242E42]">
          <div className="w-8 h-8 mx-auto border-2 border-[#E41919] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-mono text-slate-400">Aggregating telemetry from ClickHouse clusters...</p>
        </div>
      ) : reportData?.reports.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#161E2E] border border-[#242E42]">
          <p className="text-sm font-mono text-slate-400">No interfaces selected or matching criteria.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {reportData?.reports.map((report: InterfaceReportItem) => {
            const isTransit = report.type === 'transit'
            return (
              <div
                key={report.interface_name}
                className="report-card p-6 rounded-2xl bg-[#161E2E] border border-[#242E42] shadow-xl flex flex-col gap-5"
              >
                {/* Interface Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242E42] pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isTransit ? 'bg-[#E41919] shadow-sm shadow-[#E41919]' : 'bg-[#FFCE00] shadow-sm shadow-[#FFCE00]'
                      }`}
                    />
                    <h2 className="text-lg md:text-xl font-mono font-bold text-white tracking-tight m-0">
                      {report.interface_name}
                    </h2>
                    <span
                      className={`text-xs font-mono uppercase px-2.5 py-0.5 rounded-full font-bold tracking-wider ${
                        isTransit
                          ? 'bg-[#E41919]/15 text-[#FCA5A5] border border-[#E41919]/35'
                          : 'bg-[#FFCE00]/15 text-[#FFCE00] border border-[#FFCE00]/35'
                      }`}
                    >
                      {report.type === 'transit' ? 'Transit Upstream' : 'Internet Exchange (IX)'}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400">
                    Resolution: <span className="text-slate-200">{timeRange === '24h' ? '5m' : timeRange === '7d' ? '30m' : '1h'}</span>
                  </div>
                </div>

                {/* KPI Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  <div className="metric-box p-3 rounded-xl bg-[#0B0F17] border border-[#242E42]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">Peak Inbound</span>
                      <span className="text-xs font-bold text-[#E41919]">↓ IN</span>
                    </div>
                    <div className="text-base md:text-lg font-mono font-bold text-[#E41919] mt-1">
                      {formatMetric(report.summary.peak_inbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className="metric-box p-3 rounded-xl bg-[#0B0F17] border border-[#242E42]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">Peak Outbound</span>
                      <span className="text-xs font-bold text-[#FFCE00]">↑ OUT</span>
                    </div>
                    <div className="text-base md:text-lg font-mono font-bold text-[#FFCE00] mt-1">
                      {formatMetric(report.summary.peak_outbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className="metric-box p-3 rounded-xl bg-[#0B0F17] border border-[#242E42]">
                    <span className="text-[11px] font-mono text-slate-400">Average Inbound</span>
                    <div className="text-base md:text-lg font-mono font-bold text-slate-100 mt-1">
                      {formatMetric(report.summary.avg_inbound_bps, 'traffic')}
                    </div>
                  </div>

                  <div className="metric-box p-3 rounded-xl bg-[#0B0F17] border border-[#242E42]">
                    <span className="text-[11px] font-mono text-slate-400">Average Outbound</span>
                    <div className="text-base md:text-lg font-mono font-bold text-slate-300 mt-1">
                      {formatMetric(report.summary.avg_outbound_bps, 'traffic')}
                    </div>
                  </div>
                </div>

                {/* Split Layout: Left = ECharts Timeline, Right = Top 10 ASNs Table */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  {/* Left Column: Timeline */}
                  <div className="lg:col-span-7 flex flex-col p-4 rounded-xl bg-[#0B0F17] border border-[#242E42]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                        <span className="text-xs font-mono font-bold text-slate-200">
                          Throughput Utilization Timeline
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="flex items-center gap-1 text-[#E41919]">
                          <span className="w-2 h-2 rounded-full bg-[#E41919]" />
                          Inbound
                        </span>
                        <span className="flex items-center gap-1 text-[#FFCE00]">
                          <span className="w-2 h-2 rounded-full bg-[#FFCE00]" />
                          Outbound
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center">
                      <InterfaceTimelineChart series={report.series} timeRange={timeRange} />
                    </div>
                  </div>

                  {/* Right Column: Top 10 ASNs */}
                  <div className="lg:col-span-5 flex flex-col p-4 rounded-xl bg-[#0B0F17] border border-[#242E42]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span className="text-xs font-mono font-bold text-slate-200">
                          Top 10 Talker Source ASNs (Inbound)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">By Ingress Volume</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-[#242E42] text-[10px] text-slate-500 uppercase">
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
                              className="asn-row border-b border-[#1E2838]/60 hover:bg-[#161E2E]/60 transition-colors"
                            >
                              <td className="py-1.5 px-1.5 text-center text-slate-500 font-bold">
                                {idx === 0 ? (
                                  <span className="text-[#FFCE00]">1</span>
                                ) : idx === 1 ? (
                                  <span className="text-slate-200">2</span>
                                ) : idx === 2 ? (
                                  <span className="text-[#FCA5A5]">3</span>
                                ) : (
                                  idx + 1
                                )}
                              </td>
                              <td className="py-1.5 px-2">
                                <div className="text-slate-100 font-bold leading-tight">{asn.asn}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[150px] sm:max-w-[200px]" title={asn.org}>
                                  {asn.org}
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-right font-bold text-slate-200 whitespace-nowrap">
                                {formatMetric(asn.bps, 'traffic')}
                              </td>
                              <td className="py-1.5 px-2 text-right whitespace-nowrap">
                                <div className="flex flex-col items-end">
                                  <span className="text-[11px] font-bold text-[#E41919]">
                                    {asn.percent.toFixed(1)}%
                                  </span>
                                  <div className="w-16 h-1 bg-[#242E42] rounded-full overflow-hidden mt-0.5">
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

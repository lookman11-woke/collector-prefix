import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { formatMetric } from '../data/mock'
import type { TrafficOverviewResponse } from '../api/client'

type Props = {
  data: TrafficOverviewResponse | null
  metric: 'traffic' | 'packets'
  timeRange: string
  theme?: 'dark' | 'light'
}

function computeUnitScale(peakVal: number, isPackets: boolean) {
  if (isPackets) {
    if (peakVal >= 1e12) return { divisor: 1e12, unit: 'Tpps', unitShort: 'T' }
    if (peakVal >= 1e9) return { divisor: 1e9, unit: 'Gpps', unitShort: 'G' }
    if (peakVal >= 1e6) return { divisor: 1e6, unit: 'Mpps', unitShort: 'M' }
    if (peakVal >= 1e3) return { divisor: 1e3, unit: 'kpps', unitShort: 'k' }
    return { divisor: 1, unit: 'pps', unitShort: '' }
  }
  if (peakVal >= 1e12) return { divisor: 1e12, unit: 'Tbps', unitShort: 'T' }
  if (peakVal >= 1e9) return { divisor: 1e9, unit: 'Gbps', unitShort: 'G' }
  if (peakVal >= 1e6) return { divisor: 1e6, unit: 'Mbps', unitShort: 'M' }
  if (peakVal >= 1e3) return { divisor: 1e3, unit: 'Kbps', unitShort: 'K' }
  return { divisor: 1, unit: 'bps', unitShort: '' }
}

export default function TrafficOverview({ data, metric, theme = 'dark' }: Props) {
  const isLight = theme === 'light'
  const series = useMemo(() => data?.series || [], [data])
  const summary = data?.summary || {
    current_inbound_bps: 0,
    current_outbound_bps: 0,
    peak_inbound_bps: 0,
    peak_outbound_bps: 0,
    average_inbound_bps: 0,
    average_outbound_bps: 0,
  }

  const times = useMemo(() => {
    return series.map((s) => {
      const d = new Date(s.timestamp)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
  }, [series])

  const peakInWindow = useMemo(() => {
    if (series.length === 0) return 0
    let max = 0
    for (const s of series) {
      if (s.inbound_bps > max) max = s.inbound_bps
      if (s.outbound_bps > max) max = s.outbound_bps
    }
    return max
  }, [series])

  const scale = useMemo(() => {
    return computeUnitScale(peakInWindow, metric === 'packets')
  }, [peakInWindow, metric])

  const inSeries = useMemo(() => {
    return series.map((s) => parseFloat((s.inbound_bps / scale.divisor).toFixed(2)))
  }, [series, scale.divisor])

  const outSeries = useMemo(() => {
    return series.map((s) => parseFloat((s.outbound_bps / scale.divisor).toFixed(2)))
  }, [series, scale.divisor])

  const hasData = series.length > 0

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
      animationDuration: 500,
      grid: {
        left: 55,
        right: 25,
        top: 25,
        bottom: 25,
      },
      legend: {
        show: true,
        top: 0,
        right: 25,
        textStyle: {
          color: isLight ? '#334155' : '#94A3B8',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        itemWidth: 14,
        itemHeight: 8,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(22, 30, 46, 0.96)',
        borderColor: isLight ? '#CBD5E1' : '#242E42',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: isLight ? '#0F172A' : '#F1F5F9',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        },
        formatter: (params: any[]) => {
          const t = params[0]?.axisValue ?? ''
          const rows = (params || [])
            .map((p: any) => {
              const color = p.seriesName === 'Inbound (Ingress)' ? '#E41919' : isLight ? '#D97706' : '#FFCE00'
              return `
                <div style="display:flex; justify-content:space-between; gap:16px; margin-top:3px;">
                  <span style="color:${color}; font-weight:600;">${p.seriesName}:</span>
                  <span style="font-weight:700; color:${isLight ? '#0F172A' : '#FFFFFF'};">${p.value} ${scale.unit}</span>
                </div>
              `
            })
            .join('')
          return `
            <div style="font-size:11px; font-family:JetBrains Mono, monospace;">
              <div style="color:${isLight ? '#475569' : '#64748B'}; margin-bottom:4px; font-weight:600; border-bottom:1px solid ${isLight ? '#E2E8F0' : '#242E42'}; padding-bottom:3px;">Time: ${t}</div>
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
        axisLine: { lineStyle: { color: isLight ? '#CBD5E1' : '#242E42' } },
        axisTick: { show: false },
        axisLabel: {
          color: isLight ? '#475569' : '#64748B',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          interval: Math.max(1, Math.floor(times.length / 8)),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: scale.unit,
        nameTextStyle: {
          color: isLight ? '#D97706' : '#FFCE00',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          padding: [0, 0, 4, 0],
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
          smooth: 0.35,
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
          smooth: 0.35,
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
                { offset: 0, color: isLight ? 'rgba(217, 119, 6, 0.22)' : 'rgba(255, 206, 0, 0.22)' },
                { offset: 1, color: isLight ? 'rgba(217, 119, 6, 0.01)' : 'rgba(255, 206, 0, 0.01)' },
              ],
            },
          },
        },
      ],
    }
  }, [times, inSeries, outSeries, scale, hasData, isLight])

  return (
    <div className="bg-[#161E2E] border border-[#242E42] rounded-xl p-4 flex flex-col w-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#242E42] flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#E41919]">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="font-semibold text-sm text-white tracking-tight">Traffic Overview (Time Series)</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FFCE00]/10 text-[#FFCE00] border border-[#FFCE00]/30">
            Scale: {scale.unit}
          </span>
        </div>

      {/* Live bitrate / packet rate readout */}
      <div className="flex items-center gap-4 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#E41919]" />
          <span className="text-slate-400">Current In:</span>
          <span className="font-bold text-[#FF4D4D]">{formatMetric(summary.current_inbound_bps, metric)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#FFCE00]" />
          <span className="text-slate-400">Current Out:</span>
          <span className="font-bold text-[#FFCE00]">{formatMetric(summary.current_outbound_bps, metric)}</span>
        </div>
      </div>
    </div>

    {/* Chart Viewport */}
    <div className="w-full h-72 sm:h-80 pt-2">
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
          No flow data available for the active filter set.
        </div>
      )}
    </div>

    {/* Footer Tabular Breakdown */}
    <div className="grid grid-cols-3 gap-3 border-t border-[#242E42] pt-3 mt-1 text-center font-mono">
      <div className="border-r border-[#242E42]/60 pr-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Instantaneous Rate</div>
        <div className="text-xs font-semibold text-slate-200">
          <span className="text-[#FF4D4D] mr-2">↓{formatMetric(summary.current_inbound_bps, metric)}</span>
          <span className="text-[#FFCE00]">↑{formatMetric(summary.current_outbound_bps, metric)}</span>
        </div>
      </div>
      <div className="border-r border-[#242E42]/60 pr-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Peak in Window</div>
        <div className="text-xs font-semibold text-slate-200">
          <span className="text-[#FF4D4D] mr-2">↓{formatMetric(summary.peak_inbound_bps, metric)}</span>
          <span className="text-[#FFCE00]">↑{formatMetric(summary.peak_outbound_bps, metric)}</span>
        </div>
      </div>
      <div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Window Average</div>
        <div className="text-xs font-semibold text-slate-200">
          <span className="text-[#FF4D4D] mr-2">↓{formatMetric(summary.average_inbound_bps, metric)}</span>
          <span className="text-[#FFCE00]">↑{formatMetric(summary.average_outbound_bps, metric)}</span>
        </div>
      </div>
    </div>
    </div>
  )
}

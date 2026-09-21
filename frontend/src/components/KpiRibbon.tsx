import { useMemo } from 'react'
import { formatMetric } from '../data/mock'
import type { TrafficOverviewResponse, SystemStatus } from '../api/client'
import type { Interface } from '../data/mock'

type Props = {
  trafficData: TrafficOverviewResponse | null
  status: SystemStatus | null
  interfaces: Interface[]
  selectedInterfaces: Set<string>
  selectedPrefixCount: number
  totalPrefixCount: number
  metric?: 'traffic' | 'packets'
}

export default function KpiRibbon({
  trafficData,
  status,
  interfaces,
  selectedInterfaces,
  selectedPrefixCount,
  totalPrefixCount,
  metric = 'traffic',
}: Props) {
  const summary = trafficData?.summary || {
    current_inbound_bps: 0,
    current_outbound_bps: 0,
    peak_inbound_bps: 0,
    peak_outbound_bps: 0,
    average_inbound_bps: 0,
    average_outbound_bps: 0,
  }

  const selectedIfaceCount = useMemo(
    () => interfaces.filter((i) => selectedInterfaces.has(i.id)).length,
    [interfaces, selectedInterfaces]
  )

  const isOnline = status?.online ?? false
  const flowsInserted = status?.flows_inserted || 0
  const dbStatus = status?.db_status || 'connected'

  const liveBadgeText = metric === 'packets' ? 'Live Packets (pps)' : 'Live Bitrate (bps)'

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* 1. Ingress Throughput / Packet Rate Card */}
      <div className="bg-[#161E2E] border border-[#242E42] rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#E41919]" />
            <span className="text-xs font-semibold text-slate-300">Total Ingress (Inbound)</span>
          </div>
          <span className="text-[10px] font-mono text-[#FCA5A5] bg-[#E41919]/15 px-1.5 py-0.5 rounded border border-[#E41919]/30">
            {liveBadgeText}
          </span>
        </div>

        <div className="my-2">
          <div className="font-mono text-2xl font-bold tracking-tight text-white flex items-baseline gap-1.5">
            <span className="text-[#FF4D4D] text-lg">↓</span>
            <span>{formatMetric(summary.current_inbound_bps, metric)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono border-t border-[#242E42]/60 pt-2 text-slate-400">
          <span>Peak: <strong className="text-slate-200">{formatMetric(summary.peak_inbound_bps, metric)}</strong></span>
          <span>Avg: <strong className="text-slate-300">{formatMetric(summary.average_inbound_bps, metric)}</strong></span>
        </div>
      </div>

      {/* 2. Egress Throughput / Packet Rate Card */}
      <div className="bg-[#161E2E] border border-[#242E42] rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#FFCE00]" />
            <span className="text-xs font-semibold text-slate-300">Total Egress (Outbound)</span>
          </div>
          <span className="text-[10px] font-mono text-[#FFCE00] bg-[#FFCE00]/15 px-1.5 py-0.5 rounded border border-[#FFCE00]/30">
            {liveBadgeText}
          </span>
        </div>

        <div className="my-2">
          <div className="font-mono text-2xl font-bold tracking-tight text-white flex items-baseline gap-1.5">
            <span className="text-[#FFCE00] text-lg">↑</span>
            <span>{formatMetric(summary.current_outbound_bps, metric)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono border-t border-[#242E42]/60 pt-2 text-slate-400">
          <span>Peak: <strong className="text-slate-200">{formatMetric(summary.peak_outbound_bps, metric)}</strong></span>
          <span>Avg: <strong className="text-slate-300">{formatMetric(summary.average_outbound_bps, metric)}</strong></span>
        </div>
      </div>

      {/* 3. Telemetry & Pipeline Overview Card */}
      <div className="bg-[#161E2E] border border-[#242E42] rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300">Telemetry & Pipeline</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className={`text-[10px] font-mono font-semibold ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isOnline ? 'Collector Active' : 'Collector Standby'}
              </span>
            </div>
            <span className="text-slate-600">·</span>
            <span className="text-[10px] font-mono font-medium text-[#FFCE00]">
              {dbStatus === 'connected' ? 'DB Connected' : 'DB Ready'}
            </span>
          </div>
        </div>

        <div className="my-1.5 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Active Scope</div>
            <div className="font-mono text-xs font-semibold text-slate-200 mt-0.5">
              <span className="text-white font-bold">{selectedPrefixCount}</span><span className="text-slate-400">/{totalPrefixCount}</span> subnets · <span className="text-white font-bold">{selectedIfaceCount}</span> ifaces
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Processed Flows</div>
            <div className="font-mono text-xs font-bold text-[#FFCE00] mt-0.5 truncate">
              {flowsInserted > 0 ? flowsInserted.toLocaleString() : 'Active'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono border-t border-[#242E42]/60 pt-2 text-slate-400">
          <span>Sample Rate: <strong className="text-slate-200">1:1000</strong></span>
          <span>Interfaces: <strong className="text-slate-200">{selectedIfaceCount}/{interfaces.length}</strong></span>
        </div>
      </div>
    </div>
  )
}

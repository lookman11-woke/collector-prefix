import { useEffect, useState } from 'react'
import type { SystemStatus } from '../api/client'

type Props = {
  status: SystemStatus | null
  activeTab?: 'overview' | 'asn-explorer' | 'reports'
  onTabChange?: (tab: 'overview' | 'asn-explorer' | 'reports') => void
}

export default function Header({ status, activeTab = 'overview', onTabChange }: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  const isOnline = status?.online ?? false
  const version = status?.version || 'v0.7.20'
  const dbStatus = status?.db_status || 'connected'

  return (
    <header
      style={{
        background: 'rgba(22, 30, 46, 0.95)',
        borderBottom: '1px solid #242E42',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 no-print print:hidden"
    >
      {/* Brand Identity & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0B0F17] border border-[#242E42] shadow-inner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="9" height="9" rx="2" fill="#E41919" />
            <rect x="13" y="2" width="9" height="9" rx="2" fill="#FFCE00" />
            <rect x="2" y="13" width="9" height="9" rx="2" fill="#FFCE00" opacity="0.8" />
            <rect x="13" y="13" width="9" height="9" rx="2" fill="#E41919" opacity="0.6" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-white">
              VNT Observability Studio
            </span>
            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E41919]/15 text-[#FCA5A5] border border-[#E41919]/30">
              {version}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-normal m-0 leading-tight">
            High-Performance BGP Prefix & Upstream Telemetry Collector
          </p>
        </div>
      </div>

      {/* Center Segmented Pill Navigation Tabs */}
      <div className="flex items-center bg-[#0B0F17] p-1 rounded-lg border border-[#242E42] shadow-inner">
        <button
          type="button"
          onClick={() => onTabChange?.('overview')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-all ${
            activeTab === 'overview'
              ? 'bg-[#E41919] text-white font-bold shadow-md shadow-[#E41919]/25 border border-[#E41919]/50'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span>Overview</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange?.('asn-explorer')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-all ${
            activeTab === 'asn-explorer'
              ? 'bg-[#E41919] text-white font-bold shadow-md shadow-[#E41919]/25 border border-[#E41919]/50'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>ASN Explorer</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange?.('reports')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-mono transition-all ${
            activeTab === 'reports'
              ? 'bg-[#E41919] text-white font-bold shadow-md shadow-[#E41919]/25 border border-[#E41919]/50'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161E2E]'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Reports</span>
        </button>
      </div>

      {/* Telemetry Status & System Badges */}
      <div className="flex items-center gap-4">
        {/* Collector & DB Status */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#0B0F17]/80 rounded-lg border border-[#242E42]">
          <span className="text-[11px] text-slate-400 font-mono">Collector:</span>
          <span className="text-[11px] font-mono font-medium text-slate-200">
            {isOnline ? 'Collector Active' : 'Collector Standby'}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] text-slate-400 font-mono">Database:</span>
          <span className="text-[11px] font-mono font-medium text-[#FFCE00]">
            {dbStatus === 'connected' ? 'DB Connected' : 'DB Ready'}
          </span>
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-2 px-2.5 py-1 bg-[#0B0F17]/80 rounded-lg border border-[#242E42]">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: isOnline ? '#22c55e' : '#f59e0b',
              boxShadow: isOnline ? '0 0 8px rgba(34, 197, 94, 0.6)' : 'none',
            }}
          />
          <span
            className="text-xs font-mono font-medium"
            style={{ color: isOnline ? '#4ade80' : '#fbbf24' }}
          >
            {isOnline ? 'COLLECTOR ACTIVE' : 'SIMULATION MODE'}
          </span>
        </div>

        {/* Real-time Clock */}
        <div className="hidden md:flex flex-col text-right font-mono">
          <span className="text-xs font-bold text-slate-200">{timeStr}</span>
          <span className="text-[10px] text-slate-400">{dateStr}</span>
        </div>
      </div>
    </header>
  )
}

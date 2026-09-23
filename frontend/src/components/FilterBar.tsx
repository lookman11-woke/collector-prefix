import { useState, useRef, useEffect, useMemo } from 'react'
import type { PrefixNode, ASNPrefixGroup, Interface } from '../data/mock'

function getNodeCidrs(node: PrefixNode): string[] {
  const list = [node.cidr]
  if (node.children) {
    node.children.forEach((c) => list.push(...getNodeCidrs(c)))
  }
  return list
}

const TIME_RANGES = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
]

const REFRESH_INTERVALS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: 'Off', value: 0 },
]

type Props = {
  theme?: 'dark' | 'light'
  // Prefix & ASN props
  prefixGroups: ASNPrefixGroup[]
  selectedAsns: Set<string>
  selectedPrefixes: Set<string>
  onToggleAsn: (asn: string) => void
  onTogglePrefix: (cidr: string | string[]) => void
  onSelectAllPrefixes: () => void
  onClearPrefixes: () => void

  // Interface props
  interfaces: Interface[]
  selectedInterfaces: Set<string>
  onToggleInterface: (id: string) => void
  onSelectAllInterfaces: () => void
  onClearInterfaces: () => void
  onSelectTransitInterfaces: () => void
  onSelectIxInterfaces: () => void

  // Global controls
  timeRange: string
  onTimeRangeChange: (r: string) => void
  metric: 'traffic' | 'packets'
  onMetricChange: (m: 'traffic' | 'packets') => void
  refreshInterval: number
  onRefreshIntervalChange: (v: number) => void
  onRefresh: () => void
  isRefreshing?: boolean
}

function PrefixTreeNode({
  node,
  depth,
  selected,
  onToggle,
  isLight = false,
}: {
  node: PrefixNode
  depth: number
  selected: Set<string>
  onToggle: (cidr: string | string[]) => void
  isLight?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = !!node.children?.length
  const allSubCidrs = useMemo(() => getNodeCidrs(node), [node])

  const isSelected = selected.has(node.cidr)
  const allChildrenSelected = hasChildren ? allSubCidrs.every((c) => selected.has(c)) : isSelected
  const someChildrenSelected = hasChildren ? allSubCidrs.some((c) => selected.has(c)) : isSelected

  const handleRowClick = () => {
    if (hasChildren) {
      onToggle(allSubCidrs)
    } else {
      onToggle(node.cidr)
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 cursor-pointer select-none py-1 px-1.5 rounded transition-colors ${
          isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5'
        }`}
        style={{
          paddingLeft: `${4 + depth * 12}px`,
          background: isSelected || allChildrenSelected
            ? (isLight ? 'rgba(228, 25, 25, 0.08)' : 'rgba(228, 25, 25, 0.12)')
            : 'transparent',
        }}
        onClick={handleRowClick}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((x) => !x)
            }}
            className={`w-3.5 h-3.5 flex items-center justify-center ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-slate-200'} border-none bg-transparent cursor-pointer p-0 shrink-0`}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              fill="currentColor"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.14s' }}
            >
              <path d="M3 2l4 3-4 3V2z" />
            </svg>
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span
          className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors"
          style={{
            border: `1.5px solid ${allChildrenSelected || isSelected ? '#E41919' : someChildrenSelected ? '#E41919' : (isLight ? '#CBD5E1' : '#242E42')}`,
            background: allChildrenSelected || isSelected ? '#E41919' : someChildrenSelected ? (isLight ? 'rgba(228, 25, 25, 0.2)' : 'rgba(228, 25, 25, 0.3)') : 'transparent',
          }}
        >
          {(allChildrenSelected || isSelected) && (
            <svg width="7" height="7" viewBox="0 0 8 8">
              <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {someChildrenSelected && !allChildrenSelected && (
            <div className={`w-1.5 h-0.5 ${isLight ? 'bg-amber-600' : 'bg-[#FFCE00]'} rounded-sm`} />
          )}
        </span>

        <span
          className={`font-mono text-xs flex-1 truncate select-none ${
            isLight
              ? (isSelected || allChildrenSelected ? 'text-slate-900 font-semibold' : 'text-slate-700')
              : (isSelected || allChildrenSelected ? 'text-white' : 'text-slate-300')
          }`}
        >
          {node.cidr}
        </span>
      </div>

      {expanded && hasChildren && (
        <div className={`border-l ${isLight ? 'border-slate-300' : 'border-[#242E42]'} ml-2 pl-1 my-0.5`}>
          {node.children!.map((child) => (
            <PrefixTreeNode key={child.cidr} node={child} depth={depth + 1} selected={selected} onToggle={onToggle} isLight={isLight} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilterBar({
  theme = 'dark',
  prefixGroups,
  selectedAsns,
  selectedPrefixes,
  onToggleAsn,
  onTogglePrefix,
  onSelectAllPrefixes,
  onClearPrefixes,
  interfaces,
  selectedInterfaces,
  onToggleInterface,
  onSelectAllInterfaces,
  onClearInterfaces,
  onSelectTransitInterfaces,
  onSelectIxInterfaces,
  timeRange,
  onTimeRangeChange,
  metric,
  onMetricChange,
  refreshInterval,
  onRefreshIntervalChange,
  onRefresh,
  isRefreshing = false,
}: Props) {
  const isLight = theme === 'light'
  const [prefixOpen, setPrefixOpen] = useState(false)
  const [ifaceOpen, setIfaceOpen] = useState(false)
  const [prefixSearch, setPrefixSearch] = useState('')

  const prefixRef = useRef<HTMLDivElement>(null)
  const ifaceRef = useRef<HTMLDivElement>(null)

  // Click outside to close popovers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (prefixRef.current && !prefixRef.current.contains(event.target as Node)) {
        setPrefixOpen(false)
      }
      if (ifaceRef.current && !ifaceRef.current.contains(event.target as Node)) {
        setIfaceOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Calculate totals & counts
  const allCidrs = useMemo(() => {
    const list: string[] = []
    prefixGroups.forEach((g) => {
      const walk = (nodes: PrefixNode[]) => {
        nodes.forEach((n) => {
          list.push(n.cidr)
          if (n.children) walk(n.children)
        })
      }
      walk(g.tree)
    })
    return Array.from(new Set(list))
  }, [prefixGroups])

  const totalPrefixCount = allCidrs.length
  const selectedPrefixCount = selectedPrefixes.size

  const totalIfaceCount = interfaces.length
  const selectedIfaceCount = useMemo(
    () => interfaces.filter((i) => selectedInterfaces.has(i.id)).length,
    [interfaces, selectedInterfaces]
  )

  const filteredGroups = useMemo(() => {
    if (!prefixSearch.trim()) return prefixGroups
    const q = prefixSearch.toLowerCase().trim()
    return prefixGroups
      .map((g) => ({
        ...g,
        tree: g.tree.filter((n) => n.cidr.includes(q) || n.children?.some((c) => c.cidr.includes(q))),
      }))
      .filter((g) => g.tree.length > 0 || g.asn.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
  }, [prefixGroups, prefixSearch])

  const transits = useMemo(() => interfaces.filter((i) => i.type === 'transit'), [interfaces])
  const ixs = useMemo(() => interfaces.filter((i) => i.type === 'ix'), [interfaces])

  return (
    <div
      className={`w-full flex items-center justify-between gap-3 px-5 py-2.5 ${
        isLight ? 'bg-white/90 border-slate-200' : 'bg-[#161E2E]/90 border-[#242E42]'
      } border-b backdrop-blur-md relative z-40 flex-wrap`}
    >
      {/* Left Filters: Prefixes & Interfaces Popover Triggers */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Prefixes Popover Trigger */}
        <div className="relative" ref={prefixRef}>
          <button
            type="button"
            onClick={() => {
              setPrefixOpen(!prefixOpen)
              if (ifaceOpen) setIfaceOpen(false)
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              prefixOpen || (selectedPrefixCount > 0 && selectedPrefixCount < totalPrefixCount)
                ? isLight
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-[#E41919]/15 border-[#E41919]/60 text-white'
                : isLight
                  ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 shadow-sm'
                  : 'bg-[#0B0F17]/70 border-[#242E42] text-slate-300 hover:border-slate-600'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLight ? 'text-amber-600' : 'text-[#FFCE00]'}>
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <span>Prefixes</span>
            <span className={`font-mono text-[11px] px-1.5 py-0.2 rounded font-semibold ${
              isLight
                ? 'bg-slate-100 border border-slate-200 text-slate-800'
                : 'bg-[#161E2E] border border-[#242E42] text-[#FFCE00]'
            }`}>
              {selectedPrefixCount}/{totalPrefixCount}
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              className={`text-slate-400 transition-transform ${prefixOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3z" />
            </svg>
          </button>

          {/* Prefix Popover Menu */}
          {prefixOpen && (
            <div className={`absolute left-0 top-full mt-2 w-80 sm:w-96 max-h-[480px] rounded-xl shadow-2xl p-3 flex flex-col z-50 animate-in fade-in zoom-in-95 duration-100 ${
              isLight ? 'bg-white border border-slate-200 shadow-2xl text-slate-800' : 'bg-[#161E2E] border border-[#242E42]'
            }`}>
              <div className={`flex items-center justify-between gap-2 pb-2.5 border-b ${isLight ? 'border-slate-200' : 'border-[#242E42]'}`}>
                <span className={`text-xs font-semibold tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>BGP Prefix Filter</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={onSelectAllPrefixes}
                    className={`px-2 py-0.5 text-[11px] font-mono rounded border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-[#242E42]'
                    }`}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={onClearPrefixes}
                    className={`px-2 py-0.5 text-[11px] font-mono rounded border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-[#242E42]'
                    }`}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative my-2.5">
                <input
                  type="text"
                  placeholder="Search CIDR or ASN..."
                  value={prefixSearch}
                  onChange={(e) => setPrefixSearch(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-[#E41919] border ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:bg-white'
                      : 'bg-[#0B0F17] border-[#242E42] text-slate-200 placeholder:text-slate-500'
                  }`}
                />
              </div>

              {/* Tree Content */}
              <div className="overflow-y-auto max-h-[320px] pr-1 space-y-2">
                {filteredGroups.map((group) => {
                  const isAsnSelected = selectedAsns.has(group.asn)
                  return (
                    <div key={group.asn} className={`rounded-lg p-2 border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0B0F17]/60 border-[#242E42]/80'
                    }`}>
                      <div className={`flex items-center justify-between gap-2 mb-1.5 pb-1 border-b ${
                        isLight ? 'border-slate-200' : 'border-[#242E42]/40'
                      }`}>
                        <div
                          className="flex items-center gap-1.5 cursor-pointer"
                          onClick={() => onToggleAsn(group.asn)}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors"
                            style={{
                              border: `1.5px solid ${isAsnSelected ? (isLight ? '#B45309' : '#FFCE00') : (isLight ? '#CBD5E1' : '#242E42')}`,
                              background: isAsnSelected ? (isLight ? '#B45309' : '#FFCE00') : 'transparent',
                            }}
                          >
                            {isAsnSelected && (
                              <svg width="7" height="7" viewBox="0 0 8 8">
                                <path d="M1 4l2 2 4-4" stroke={isLight ? '#FFFFFF' : '#0B0F17'} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className={`font-mono text-xs font-bold ${isLight ? 'text-amber-700' : 'text-[#FFCE00]'}`}>{group.asn}</span>
                          <span className={`text-[11px] truncate max-w-[150px] ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>{group.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{group.prefix_count} pfx</span>
                      </div>

                      <div className="space-y-0.5">
                        {group.tree.map((node) => (
                          <PrefixTreeNode
                            key={node.cidr}
                            node={node}
                            depth={0}
                            selected={selectedPrefixes}
                            onToggle={onTogglePrefix}
                            isLight={isLight}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Interfaces Popover Trigger */}
        <div className="relative" ref={ifaceRef}>
          <button
            type="button"
            onClick={() => {
              setIfaceOpen(!ifaceOpen)
              if (prefixOpen) setPrefixOpen(false)
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              ifaceOpen || (selectedIfaceCount > 0 && selectedIfaceCount < totalIfaceCount)
                ? isLight
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-[#E41919]/15 border-[#E41919]/60 text-white'
                : isLight
                  ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 shadow-sm'
                  : 'bg-[#0B0F17]/70 border-[#242E42] text-slate-300 hover:border-slate-600'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLight ? 'text-sky-600' : 'text-[#38BDF8]'}>
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>Interfaces</span>
            <span className={`font-mono text-[11px] px-1.5 py-0.2 rounded font-semibold ${
              isLight
                ? 'bg-slate-100 border border-slate-200 text-slate-800'
                : 'bg-[#161E2E] border border-[#242E42] text-[#38BDF8]'
            }`}>
              {selectedIfaceCount}/{totalIfaceCount}
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              className={`text-slate-400 transition-transform ${ifaceOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3z" />
            </svg>
          </button>

          {/* Interfaces Popover Menu */}
          {ifaceOpen && (
            <div className={`absolute left-0 top-full mt-2 w-72 sm:w-80 max-h-[420px] rounded-xl shadow-2xl p-3 flex flex-col z-50 animate-in fade-in zoom-in-95 duration-100 ${
              isLight ? 'bg-white border border-slate-200 shadow-2xl text-slate-800' : 'bg-[#161E2E] border border-[#242E42]'
            }`}>
              <div className={`flex items-center justify-between gap-2 pb-2.5 border-b ${isLight ? 'border-slate-200' : 'border-[#242E42]'}`}>
                <span className={`text-xs font-semibold tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>Transit & IX Filter</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={onSelectAllInterfaces}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-[#242E42]'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={onSelectTransitInterfaces}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-[#E41919]/20 hover:bg-[#E41919]/30 text-[#FCA5A5] border-[#E41919]/40'
                    }`}
                  >
                    IPT
                  </button>
                  <button
                    type="button"
                    onClick={onSelectIxInterfaces}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-[#FFCE00]/20 hover:bg-[#FFCE00]/30 text-[#FFCE00] border-[#FFCE00]/40'
                    }`}
                  >
                    IX
                  </button>
                  <button
                    type="button"
                    onClick={onClearInterfaces}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-[#242E42]'
                    }`}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[300px] pr-1 space-y-3 mt-2">
                {/* Transit section */}
                {transits.length > 0 && (
                  <div>
                    <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      IP Transit (IPT)
                    </div>
                    <div className="space-y-1">
                      {transits.map((iface) => {
                        const isSelected = selectedInterfaces.has(iface.id)
                        return (
                          <button
                            type="button"
                            key={iface.id}
                            onClick={() => onToggleInterface(iface.id)}
                            className={`w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors border ${
                              isSelected
                                ? isLight
                                  ? 'bg-red-50 border-red-300 text-red-900'
                                  : 'bg-[#E41919]/15 border-[#E41919]/40'
                                : isLight
                                  ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                                  : 'bg-[#0B0F17]/50 border-[#242E42]/50 hover:border-slate-600'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                              style={{
                                border: `1.5px solid ${isSelected ? '#E41919' : (isLight ? '#CBD5E1' : '#242E42')}`,
                                background: isSelected ? '#E41919' : 'transparent',
                              }}
                            >
                              {isSelected && (
                                <svg width="7" height="7" viewBox="0 0 8 8">
                                  <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className={`font-mono text-xs ${isSelected ? (isLight ? 'text-red-900 font-semibold' : 'text-white') : (isLight ? 'text-slate-800' : 'text-slate-300')}`}>{iface.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* IX section */}
                {ixs.length > 0 && (
                  <div>
                    <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Internet Exchange (IX)
                    </div>
                    <div className="space-y-1">
                      {ixs.map((iface) => {
                        const isSelected = selectedInterfaces.has(iface.id)
                        return (
                          <button
                            type="button"
                            key={iface.id}
                            onClick={() => onToggleInterface(iface.id)}
                            className={`w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors border ${
                              isSelected
                                ? isLight
                                  ? 'bg-red-50 border-red-300 text-red-900'
                                  : 'bg-[#FFCE00]/15 border-[#FFCE00]/40'
                                : isLight
                                  ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                                  : 'bg-[#0B0F17]/50 border-[#242E42]/50 hover:border-slate-600'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                              style={{
                                border: `1.5px solid ${isSelected ? (isLight ? '#E41919' : '#FFCE00') : (isLight ? '#CBD5E1' : '#242E42')}`,
                                background: isSelected ? (isLight ? '#E41919' : '#FFCE00') : 'transparent',
                              }}
                            >
                              {isSelected && (
                                <svg width="7" height="7" viewBox="0 0 8 8">
                                  <path d="M1 4l2 2 4-4" stroke={isLight ? 'white' : '#0B0F17'} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className={`font-mono text-xs ${isSelected ? (isLight ? 'text-red-900 font-semibold' : 'text-white') : (isLight ? 'text-slate-800' : 'text-slate-300')}`}>{iface.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls: Metric, TimeRange, Auto-Refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Metric toggle */}
        <div className={`flex items-center rounded-lg p-0.5 border ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0B0F17] border-[#242E42]'
        }`}>
          <button
            type="button"
            onClick={() => onMetricChange('traffic')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              metric === 'traffic'
                ? 'bg-[#E41919] text-white shadow-sm'
                : isLight
                  ? 'text-slate-700 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Traffic (bps)
          </button>
          <button
            type="button"
            onClick={() => onMetricChange('packets')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              metric === 'packets'
                ? 'bg-[#E41919] text-white shadow-sm'
                : isLight
                  ? 'text-slate-700 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Packets (pps)
          </button>
        </div>

        {/* Time range selector */}
        <div className={`flex items-center rounded-lg p-0.5 border ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0B0F17] border-[#242E42]'
        }`}>
          {TIME_RANGES.map((r) => (
            <button
              type="button"
              key={r.value}
              onClick={() => onTimeRangeChange(r.value)}
              className={`px-2 py-1 rounded text-xs font-mono font-medium transition-colors ${
                timeRange === r.value
                  ? isLight
                    ? 'bg-slate-100 text-slate-900 border border-slate-300 font-semibold shadow-sm'
                    : 'bg-[#161E2E] text-[#FFCE00] border border-[#FFCE00]/40'
                  : isLight
                    ? 'text-slate-700 hover:bg-slate-100 border border-transparent'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Auto Refresh intervals */}
        <div className="flex items-center gap-1">
          <span className={`text-[11px] font-mono hidden sm:inline ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Sync:</span>
          {REFRESH_INTERVALS.map((iv) => (
            <button
              type="button"
              key={iv.label}
              onClick={() => onRefreshIntervalChange(iv.value)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${
                refreshInterval === iv.value
                  ? isLight
                    ? 'bg-red-50 text-red-700 border-red-300 font-semibold'
                    : 'bg-[#E41919]/20 text-[#FFCE00] border border-[#FFCE00]/40'
                  : isLight
                    ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 shadow-sm'
                    : 'bg-[#0B0F17] text-slate-400 border border-[#242E42] hover:text-slate-200'
              }`}
            >
              {iv.label}
            </button>
          ))}

          {/* Manual Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-[#E41919] hover:bg-[#B91C1C] text-white border border-[#E41919] transition-colors ml-1 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={isRefreshing ? 'animate-spin' : ''}
            >
              <path
                d="M13.65 2.35A8 8 0 1 0 15 8h-2a6 6 0 1 1-1.09-3.45l-1.96 1.96L14 10V4h-6l2.23 2.23a5.99 5.99 0 0 0-1.88-3.88z"
              />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>
  )
}

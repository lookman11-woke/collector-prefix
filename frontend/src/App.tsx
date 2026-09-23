import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import Header from './components/Header'
import FilterBar from './components/FilterBar'
import KpiRibbon from './components/KpiRibbon'
import TrafficOverview from './components/TrafficOverview'
import SankeyFlow from './components/SankeyFlow'
import AsnExplorer from './components/AsnExplorer'
import ReportView from './components/ReportView'
import {
  getStatus,
  getASNs,
  getPrefixTree,
  getInterfaces,
  getTrafficOverview,
  getAsnFlow,
  type SystemStatus,
  type TrafficOverviewResponse,
  type AsnFlowResponse,
  type ASNPrefixGroup,
} from './api/client'
import { INTERFACES, MOCK_PREFIX_GROUPS, MOCK_ASNS, type Interface } from './data/mock'

function flatCidrs(groups: ASNPrefixGroup[]): string[] {
  const cidrs: string[] = []
  const walk = (nodes: any[]) =>
    nodes.forEach((n) => {
      cidrs.push(n.cidr)
      if (n.children) walk(n.children)
    })
  groups.forEach((g) => walk(g.tree))
  return cidrs
}

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [prefixGroups, setPrefixGroups] = useState<ASNPrefixGroup[]>(MOCK_PREFIX_GROUPS)
  const [interfaces, setInterfaces] = useState<Interface[]>(INTERFACES)
  const [trafficData, setTrafficData] = useState<TrafficOverviewResponse | null>(null)
  const [asnData, setAsnData] = useState<AsnFlowResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'asn-explorer' | 'reports'>('overview')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('vnt_theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    }
    localStorage.setItem('vnt_theme', theme)
  }, [theme])

  // Filter state
  const [selectedAsns, setSelectedAsns] = useState<Set<string>>(new Set(MOCK_ASNS.map((a) => a.asn)))
  const [selectedPrefixes, setSelectedPrefixes] = useState<Set<string>>(new Set(flatCidrs(MOCK_PREFIX_GROUPS)))
  const [selectedInterfaces, setSelectedInterfaces] = useState<Set<string>>(new Set(INTERFACES.map((i) => i.id)))
  const [metric, setMetric] = useState<'traffic' | 'packets'>('traffic')
  const [timeRange, setTimeRange] = useState('1h')
  const [sankeyTopN, setSankeyTopN] = useState(10)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const hasSyncedPrefixes = useRef(false)
  const hasSyncedInterfaces = useRef(false)

  // 1. Load metadata
  const loadMetadata = useCallback(async () => {
    const [st, asns, tree, ifaces] = await Promise.all([
      getStatus(),
      getASNs(),
      getPrefixTree(),
      getInterfaces(),
    ])
    if (st) setStatus(st)
    if (asns && asns.asns.length > 0) {
      if (tree && tree.groups.length > 0) {
        setPrefixGroups(tree.groups)
        if (!hasSyncedPrefixes.current) {
          hasSyncedPrefixes.current = true
          setSelectedAsns(new Set(tree.groups.map((g) => g.asn)))
          setSelectedPrefixes(new Set(flatCidrs(tree.groups)))
        } else {
          const validCidrs = new Set(flatCidrs(tree.groups))
          const validAsns = new Set(tree.groups.map((g) => g.asn))
          setSelectedPrefixes((prev) => new Set([...prev].filter((c) => validCidrs.has(c))))
          setSelectedAsns((prev) => new Set([...prev].filter((a) => validAsns.has(a))))
        }
      }
    }
    if (ifaces && ifaces.interfaces.length > 0) {
      setInterfaces(ifaces.interfaces)
      if (!hasSyncedInterfaces.current) {
        hasSyncedInterfaces.current = true
        setSelectedInterfaces(new Set(ifaces.interfaces.map((i) => i.id)))
      } else {
        const validIfaceIds = new Set(ifaces.interfaces.map((i) => i.id))
        setSelectedInterfaces((prev) => {
          const filtered = new Set([...prev].filter((id) => validIfaceIds.has(id)))
          return filtered.size > 0 ? filtered : new Set(ifaces.interfaces.map((i) => i.id))
        })
      }
    }
  }, [])

  // 2. Load traffic charts
  const loadData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const asnList = Array.from(selectedAsns)
      const prefList = Array.from(selectedPrefixes)
      const ifaceList = Array.from(selectedInterfaces)

      const [st, traf, flow] = await Promise.all([
        getStatus(),
        getTrafficOverview({
          time_range: timeRange,
          metric,
          direction: 'both',
          selected_asns: asnList,
          selected_prefixes: prefList,
          selected_interfaces: ifaceList,
        }),
        getAsnFlow({
          time_range: timeRange,
          selected_asns: asnList,
          selected_prefixes: prefList,
          selected_interfaces: ifaceList,
          top_n: sankeyTopN,
        }),
      ])

      if (st) setStatus(st)
      if (traf) setTrafficData(traf)
      if (flow) setAsnData(flow)
    } finally {
      setIsRefreshing(false)
    }
  }, [selectedAsns, selectedPrefixes, selectedInterfaces, timeRange, metric, sankeyTopN])

  useEffect(() => {
    loadMetadata()
  }, [loadMetadata])

  // Reconcile selected interfaces whenever interfaces list changes
  useEffect(() => {
    setSelectedInterfaces((prev) => {
      const validIds = new Set(interfaces.map((i) => i.id))
      const filtered = new Set([...prev].filter((id) => validIds.has(id)))
      if (filtered.size === prev.size && [...filtered].every((id) => prev.has(id))) {
        return prev
      }
      return filtered.size > 0 ? filtered : new Set(interfaces.map((i) => i.id))
    })
  }, [interfaces])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval === 0) return
    const id = setInterval(loadData, refreshInterval * 1000)
    return () => clearInterval(id)
  }, [refreshInterval, loadData])

  // Toggle an ASN
  const handleToggleAsn = useCallback(
    (asn: string) => {
      const group = prefixGroups.find((g) => g.asn === asn)
      if (!group) return
      const groupCidrs: string[] = []
      const walk = (nodes: any[]) =>
        nodes.forEach((n) => {
          groupCidrs.push(n.cidr)
          if (n.children) walk(n.children)
        })
      walk(group.tree)

      const isCurrentlySelected = selectedAsns.has(asn)
      setSelectedAsns((prev) => {
        const next = new Set(prev)
        if (isCurrentlySelected) next.delete(asn)
        else next.add(asn)
        return next
      })
      setSelectedPrefixes((prev) => {
        const next = new Set(prev)
        if (isCurrentlySelected) {
          groupCidrs.forEach((c) => next.delete(c))
        } else {
          groupCidrs.forEach((c) => next.add(c))
        }
        return next
      })
    },
    [prefixGroups, selectedAsns]
  )

  const handleTogglePrefix = useCallback((cidrOrList: string | string[]) => {
    const list = Array.isArray(cidrOrList) ? cidrOrList : [cidrOrList]
    setSelectedPrefixes((prev) => {
      const next = new Set(prev)
      const allPresent = list.every((c) => next.has(c))
      if (allPresent) {
        list.forEach((c) => next.delete(c))
      } else {
        list.forEach((c) => next.add(c))
      }
      return next
    })
  }, [])

  const handleSelectAllPrefixes = useCallback(() => {
    setSelectedPrefixes(new Set(flatCidrs(prefixGroups)))
    setSelectedAsns(new Set(prefixGroups.map((g) => g.asn)))
  }, [prefixGroups])

  const handleClearPrefixes = useCallback(() => {
    setSelectedPrefixes(new Set())
    setSelectedAsns(new Set())
  }, [])

  const handleToggleInterface = useCallback((id: string) => {
    setSelectedInterfaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAllInterfaces = useCallback(() => {
    setSelectedInterfaces(new Set(interfaces.map((i) => i.id)))
  }, [interfaces])

  const handleClearInterfaces = useCallback(() => {
    setSelectedInterfaces(new Set())
  }, [])

  const handleSelectTransitInterfaces = useCallback(() => {
    const transits = interfaces.filter((i) => i.type === 'transit').map((i) => i.id)
    setSelectedInterfaces(new Set(transits))
  }, [interfaces])

  const handleSelectIxInterfaces = useCallback(() => {
    const ixs = interfaces.filter((i) => i.type === 'ix').map((i) => i.id)
    setSelectedInterfaces(new Set(ixs))
  }, [interfaces])

  const allCidrs = useMemo(() => flatCidrs(prefixGroups), [prefixGroups])

  return (
    <div className={`flex flex-col min-h-screen ${theme === 'light' ? 'bg-[#F8FAFC] text-slate-900' : 'bg-[#0B0F17] text-slate-100'} antialiased selection:bg-[#E41919] selection:text-white`}>
      {/* 1. Modernized Glass Header with Segmented Tab Switcher */}
      <Header
        status={status}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      {activeTab === 'overview' ? (
        <>
          {/* 2. Top Command & Filter Popover Bar */}
          <FilterBar
            prefixGroups={prefixGroups}
            selectedAsns={selectedAsns}
            selectedPrefixes={selectedPrefixes}
            onToggleAsn={handleToggleAsn}
            onTogglePrefix={handleTogglePrefix}
            onSelectAllPrefixes={handleSelectAllPrefixes}
            onClearPrefixes={handleClearPrefixes}
            interfaces={interfaces}
            selectedInterfaces={selectedInterfaces}
            onToggleInterface={handleToggleInterface}
            onSelectAllInterfaces={handleSelectAllInterfaces}
            onClearInterfaces={handleClearInterfaces}
            onSelectTransitInterfaces={handleSelectTransitInterfaces}
            onSelectIxInterfaces={handleSelectIxInterfaces}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            metric={metric}
            onMetricChange={setMetric}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
            onRefresh={loadData}
            isRefreshing={isRefreshing}
          />

          {/* 3. Full-Width Single-Column Studio Canvas */}
          <main className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
            {/* Top KPI & Telemetry Ribbon */}
            <KpiRibbon
              trafficData={trafficData}
              status={status}
              interfaces={interfaces}
              selectedInterfaces={selectedInterfaces}
              selectedPrefixCount={selectedPrefixes.size}
              totalPrefixCount={allCidrs.length}
              metric={metric}
            />

            {/* Modular Telemetry Panels (100% Full Width) */}
            <div className="flex flex-col gap-4">
              <TrafficOverview
                data={trafficData}
                metric={metric}
                timeRange={timeRange}
                theme={theme}
              />
              <SankeyFlow
                data={asnData}
                localAsns={Array.from(selectedAsns)}
                topN={sankeyTopN}
                onTopNChange={setSankeyTopN}
                onRefresh={loadData}
                theme={theme}
              />
            </div>
          </main>
        </>
      ) : activeTab === 'asn-explorer' ? (
        <main className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
          <AsnExplorer interfaces={interfaces} allPrefixes={allCidrs} theme={theme} />
        </main>
      ) : (
        <main className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
          <ReportView interfaces={interfaces} theme={theme} onThemeChange={setTheme} />
        </main>
      )}
    </div>
  )
}

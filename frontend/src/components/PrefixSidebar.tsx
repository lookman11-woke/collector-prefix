import { useState, useMemo } from 'react'
import { formatBps, type PrefixNode, type ASNPrefixGroup } from '../data/mock'

type Props = {
  groups: ASNPrefixGroup[]
  selectedPrefixes: Set<string>
  onTogglePrefix: (cidr: string | string[]) => void
  selectedAsns: Set<string>
  onToggleAsn: (asn: string) => void
}

function getNodeCidrs(node: PrefixNode): string[] {
  const list = [node.cidr]
  if (node.children) {
    node.children.forEach((c) => list.push(...getNodeCidrs(c)))
  }
  return list
}

function PrefixRow({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: PrefixNode
  depth: number
  selected: Set<string>
  onToggle: (cidr: string | string[]) => void
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
        className="flex items-center gap-1.5 cursor-pointer select-none"
        style={{
          padding: '3px 6px',
          paddingLeft: `${6 + depth * 12}px`,
          borderRadius: 5,
          background: isSelected || allChildrenSelected ? 'rgba(228, 25, 25, 0.12)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          if (!isSelected && !allChildrenSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(228, 25, 25, 0.06)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected && !allChildrenSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        {/* Expand chevron */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((x) => !x)
            }}
            style={{
              width: 12,
              height: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
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
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {/* Checkbox */}
        <button
          type="button"
          onClick={handleRowClick}
          style={{
            width: 13,
            height: 13,
            borderRadius: 3,
            flexShrink: 0,
            padding: 0,
            cursor: 'pointer',
            border: `1.5px solid ${
              allChildrenSelected || isSelected
                ? '#E41919'
                : someChildrenSelected
                ? '#E41919'
                : '#242E42'
            }`,
            background:
              allChildrenSelected || isSelected
                ? '#E41919'
                : someChildrenSelected
                ? 'rgba(228, 25, 25, 0.3)'
                : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.1s, border-color 0.1s',
          }}
        >
          {(allChildrenSelected || isSelected) && (
            <svg width="7" height="7" viewBox="0 0 8 8">
              <path
                d="M1 4l2 2 4-4"
                stroke="white"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {someChildrenSelected && !allChildrenSelected && (
            <div style={{ width: 5, height: 1.5, background: '#FFCE00', borderRadius: 1 }} />
          )}
        </button>

        <span
          onClick={handleRowClick}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            color: isSelected || allChildrenSelected ? '#FFFFFF' : '#CBD5E1',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.cidr}
        </span>

        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              fontSize: '0.58rem',
              color: '#FF4D4D',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.3,
              textAlign: 'right',
            }}
          >
            ↓{formatBps(node.inbound_bps, 1)}
          </div>
          <div
            style={{
              fontSize: '0.58rem',
              color: '#FFCE00',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.3,
              textAlign: 'right',
            }}
          >
            ↑{formatBps(node.outbound_bps, 1)}
          </div>
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <PrefixRow key={child.cidr} node={child} depth={depth + 1} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

function ASNSection({
  group,
  selectedPrefixes,
  onTogglePrefix,
  isSelectedAsn,
  onToggleAsn,
}: {
  group: ASNPrefixGroup
  selectedPrefixes: Set<string>
  onTogglePrefix: (cidr: string | string[]) => void
  isSelectedAsn: boolean
  onToggleAsn: (asn: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  const allCidrs = useMemo(() => {
    const cidrs: string[] = []
    const walk = (nodes: PrefixNode[]) =>
      nodes.forEach((n) => {
        cidrs.push(...getNodeCidrs(n))
      })
    walk(group.tree)
    return Array.from(new Set(cidrs))
  }, [group.tree])

  const allSelected = allCidrs.every((c) => selectedPrefixes.has(c))
  const someSelected = allCidrs.some((c) => selectedPrefixes.has(c))

  return (
    <div style={{ marginBottom: 4 }}>
      {/* ASN header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 6,
          background: isSelectedAsn ? 'rgba(255, 206, 0, 0.1)' : 'rgba(228, 25, 25, 0.05)',
          border: `1px solid ${isSelectedAsn ? 'rgba(255, 206, 0, 0.35)' : 'rgba(36, 46, 66, 0.9)'}`,
          marginBottom: 2,
          cursor: 'pointer',
        }}
      >
        {/* Expand chevron */}
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          style={{
            width: 12,
            height: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748B',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
          }}
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

        {/* ASN checkbox */}
        <button
          type="button"
          onClick={() => onToggleAsn(group.asn)}
          style={{
            width: 13,
            height: 13,
            borderRadius: 3,
            flexShrink: 0,
            padding: 0,
            cursor: 'pointer',
            border: `1.5px solid ${
              isSelectedAsn
                ? '#FFCE00'
                : allSelected
                ? '#E41919'
                : someSelected
                ? '#E41919'
                : '#242E42'
            }`,
            background:
              isSelectedAsn || allSelected
                ? isSelectedAsn
                  ? '#FFCE00'
                  : '#E41919'
                : someSelected
                ? 'rgba(228, 25, 25, 0.3)'
                : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.1s, border-color 0.1s',
          }}
        >
          {(isSelectedAsn || allSelected) && (
            <svg width="7" height="7" viewBox="0 0 8 8">
              <path
                d="M1 4l2 2 4-4"
                stroke={isSelectedAsn ? '#0B0F17' : '#FFFFFF'}
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* ASN + Name */}
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => onToggleAsn(group.asn)}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: isSelectedAsn ? '#FFCE00' : '#E2E8F0',
              lineHeight: 1.2,
            }}
          >
            {group.asn}
          </div>
          <div
            style={{
              fontSize: '0.6rem',
              color: '#64748B',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {group.name} · {group.prefix_count} pfx
          </div>
        </div>

        {/* Traffic summary */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '0.6rem', color: '#FF4D4D', fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>
            ↓{formatBps(group.inbound_bps, 1)}
          </div>
          <div style={{ fontSize: '0.6rem', color: '#FFCE00', fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>
            ↑{formatBps(group.outbound_bps, 1)}
          </div>
        </div>
      </div>

      {/* Prefix tree */}
      {expanded && (
        <div style={{ paddingLeft: 4 }}>
          {group.tree.map((node) => (
            <PrefixRow key={node.cidr} node={node} depth={0} selected={selectedPrefixes} onToggle={onTogglePrefix} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PrefixSidebar({
  groups,
  selectedPrefixes,
  onTogglePrefix,
  selectedAsns,
  onToggleAsn,
}: Props) {
  const [search, setSearch] = useState('')

  const filteredGroups = useMemo(() => {
    if (!search) return groups
    const q = search.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        tree: g.tree.filter((n) => n.cidr.includes(q) || n.children?.some((c) => c.cidr.includes(q))),
      }))
      .filter((g) => g.tree.length > 0 || g.asn.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
  }, [groups, search])

  const allCidrs = useMemo(() => {
    const list: string[] = []
    groups.forEach((g) => g.tree.forEach((n) => list.push(...getNodeCidrs(n))))
    return Array.from(new Set(list))
  }, [groups])

  const totalIn = useMemo(() => groups.reduce((a, g) => a + g.inbound_bps, 0), [groups])
  const totalOut = useMemo(() => groups.reduce((a, g) => a + g.outbound_bps, 0), [groups])

  return (
    <aside
      className="panel flex flex-col"
      style={{ width: 260, minWidth: 220, maxWidth: 280, height: '100%', overflow: 'hidden' }}
    >
      {/* Header */}
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #242E42' }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#E2E8F0', letterSpacing: '0.04em' }}>
            Prefixes
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="btn-pill btn-pill-ghost"
              style={{ fontSize: '0.6rem', padding: '2px 8px' }}
              onClick={() => onTogglePrefix(allCidrs)}
            >
              All
            </button>
            <button
              type="button"
              className="btn-pill btn-pill-ghost"
              style={{ fontSize: '0.6rem', padding: '2px 8px' }}
              onClick={() => {
                allCidrs.forEach((c) => selectedPrefixes.has(c) && onTogglePrefix(c))
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="#64748B"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" />
          </svg>
          <input
            className="search-input"
            placeholder="Search prefix or ASN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Total stats */}
      <div style={{ padding: '5px 10px', borderBottom: '1px solid #242E42', display: 'flex', gap: 16 }}>
        <div>
          <div className="stat-label">Combined In</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: '#FF4D4D' }}>
            {formatBps(totalIn)}
          </div>
        </div>
        <div>
          <div className="stat-label">Combined Out</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: '#FFCE00' }}>
            {formatBps(totalOut)}
          </div>
        </div>
      </div>

      {/* ASN + prefix groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
        {filteredGroups.map((group) => (
          <ASNSection
            key={group.asn}
            group={group}
            selectedPrefixes={selectedPrefixes}
            onTogglePrefix={onTogglePrefix}
            isSelectedAsn={selectedAsns.has(group.asn)}
            onToggleAsn={onToggleAsn}
          />
        ))}
      </div>
    </aside>
  )
}

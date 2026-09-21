import { useMemo } from 'react'
import { formatBps, type Interface } from '../data/mock'

type Props = {
  interfaces: Interface[]
  selectedInterfaces: Set<string>
  onToggleInterface: (id: string) => void
}

function IfaceRow({
  iface,
  selected,
  onToggle,
}: {
  iface: Interface
  selected: boolean
  onToggle: () => void
}) {
  const bps = formatBps(iface.current_bps, 1)

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 text-left"
      style={{
        padding: '5px 8px',
        borderRadius: 6,
        background: selected ? 'rgba(228, 25, 25, 0.12)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.12s',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(228, 25, 25, 0.06)'
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {/* Checkbox */}
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1.5px solid ${selected ? '#E41919' : '#242E42'}`,
          background: selected ? '#E41919' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        {selected && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="white">
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
      </span>

      {/* Name */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: selected ? '#FFFFFF' : '#CBD5E1',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {iface.name}
      </span>

      {/* Type badge */}
      <span className={`iface-tag ${iface.type === 'transit' ? 'iface-tag-transit' : 'iface-tag-ix'}`}>
        {iface.type === 'transit' ? 'T' : 'IX'}
      </span>

      {/* Current rate */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          color: '#64748B',
          whiteSpace: 'nowrap',
        }}
      >
        {bps}
      </span>
    </button>
  )
}

export default function InterfaceSidebar({ interfaces, selectedInterfaces, onToggleInterface }: Props) {
  const transits = useMemo(() => interfaces.filter((i) => i.type === 'transit'), [interfaces])
  const ixs = useMemo(() => interfaces.filter((i) => i.type === 'ix'), [interfaces])
  const selectedCount = useMemo(
    () => interfaces.filter((i) => selectedInterfaces.has(i.id)).length,
    [interfaces, selectedInterfaces]
  )

  const selectAll = () => interfaces.forEach((i) => !selectedInterfaces.has(i.id) && onToggleInterface(i.id))
  const clearAll = () => interfaces.forEach((i) => selectedInterfaces.has(i.id) && onToggleInterface(i.id))
  const selectTransit = () => {
    clearAll()
    transits.forEach((i) => onToggleInterface(i.id))
  }
  const selectIx = () => {
    clearAll()
    ixs.forEach((i) => onToggleInterface(i.id))
  }

  return (
    <aside
      className="panel flex flex-col"
      style={{ width: 220, minWidth: 190, maxWidth: 240, height: '100%', overflow: 'hidden' }}
    >
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #242E42' }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#E2E8F0', letterSpacing: '0.04em' }}>
            Interfaces
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              color: '#38BDF8',
              background: '#161E2E',
              border: '1px solid #242E42',
              borderRadius: '4px',
              padding: '1px 5px',
            }}
          >
            {selectedCount}/{interfaces.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn-pill btn-pill-ghost" style={{ fontSize: '0.6rem', padding: '2px 9px' }} onClick={selectAll}>
            All
          </button>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ fontSize: '0.6rem', padding: '2px 9px' }} onClick={clearAll}>
            Clear
          </button>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ fontSize: '0.6rem', padding: '2px 9px' }} onClick={selectTransit}>
            IPT
          </button>
          <button type="button" className="btn-pill btn-pill-ghost" style={{ fontSize: '0.6rem', padding: '2px 9px' }} onClick={selectIx}>
            IX
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
        {/* Transit group */}
        {transits.length > 0 && (
          <>
            <div
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                color: '#64748B',
                letterSpacing: '0.06em',
                padding: '2px 8px 4px',
              }}
            >
              Transit
            </div>
            {transits.map((iface) => (
              <IfaceRow
                key={iface.id}
                iface={iface}
                selected={selectedInterfaces.has(iface.id)}
                onToggle={() => onToggleInterface(iface.id)}
              />
            ))}
          </>
        )}

        {/* IX group */}
        {ixs.length > 0 && (
          <>
            <div
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                color: '#64748B',
                letterSpacing: '0.06em',
                padding: '10px 8px 4px',
              }}
            >
              Internet Exchange
            </div>
            {ixs.map((iface) => (
              <IfaceRow
                key={iface.id}
                iface={iface}
                selected={selectedInterfaces.has(iface.id)}
                onToggle={() => onToggleInterface(iface.id)}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  )
}

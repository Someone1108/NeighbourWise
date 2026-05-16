/**
 * CompareReplaceModal
 * Shown when the compare list is already full (2 areas).
 * Lets the user choose which existing area to replace with `pendingItem`.
 *
 * Props:
 *   pendingItem   – the item the user tried to add
 *   currentList   – array of 2 existing compare areas
 *   onReplace(i)  – called with 0 or 1 when user chooses a slot
 *   onClose       – called when user cancels or clicks backdrop
 */
import { useEffect } from 'react'

function getLabel(item) {
  return (
    item?.displayName ||
    item?.locationName ||
    item?.fullAddress ||
    item?.name ||
    'Unknown area'
  )
}

export default function CompareReplaceModal({ pendingItem, currentList, onReplace, onClose }) {
  // Escape key + body scroll lock
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const pending = getLabel(pendingItem)
  const area0  = getLabel(currentList[0])
  const area1  = getLabel(currentList[1])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      role="dialog" aria-modal="true" aria-label="Replace compare area"
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 16px',
          borderBottom: '1.5px solid #f3f4f6',
        }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>
            Compare list is full
          </p>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#101828', marginBottom: 4 }}>
            Replace which area?
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            You're adding <span style={{ fontWeight: 700, color: '#101828' }}>{pending}</span>. Choose which area to swap out.
          </p>
        </div>

        {/* Area cards */}
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[area0, area1].map((label, i) => (
            <button
              key={i}
              onClick={() => onReplace(i)}
              style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: '100%', padding: '14px 18px', borderRadius: 12,
                border: '1.5px solid #e5e7eb', background: '#fafafa',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'border-color 0.15s, background 0.15s',
                fontFamily: 'Figtree, sans-serif',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#f47c20'; e.currentTarget.style.background = '#fff7ed' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fafafa' }}
            >
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 2 }}>
                  Area {i + 1}
                </p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#101828' }}>{label}</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f47c20', whiteSpace: 'nowrap', marginLeft: 12 }}>
                Replace ›
              </span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div style={{ padding: '0 24px 20px', textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: '#6b7280', padding: '8px 16px', borderRadius: 8,
              transition: 'color 0.15s', fontFamily: 'Figtree, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#374151' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b7280' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * ChangeConditionsModal
 * Lets the user change the neighbourhood range (10 / 20 / 30 min)
 * and their situation / profile (None, Family, Elderly, Pet Owner).
 *
 * Props:
 *   rangeMinutes  – current range (number)
 *   profile       – current profile object e.g. { familyWithChildren: true }
 *   onSave({ rangeMinutes, profile }) – called when user confirms
 *   onClose       – called when user cancels or presses Escape
 */
import { useEffect, useState } from 'react'

const SITUATIONS = [
  { key: 'none',      label: 'No preference',   emoji: '🏠', profile: {} },
  { key: 'family',    label: 'Family',           emoji: '👨‍👩‍👧', profile: { familyWithChildren: true } },
  { key: 'elderly',   label: 'Elderly',          emoji: '🧓', profile: { elderly: true } },
  { key: 'petOwner',  label: 'Pet Owner',        emoji: '🐾', profile: { petOwner: true } },
]

const RANGES = [10, 20, 30]

function profileToKey(profile) {
  if (!profile) return 'none'
  if (profile.familyWithChildren) return 'family'
  if (profile.elderly) return 'elderly'
  if (profile.petOwner) return 'petOwner'
  return 'none'
}

export default function ChangeConditionsModal({ rangeMinutes, profile, onSave, onClose }) {
  const [range, setRange] = useState(
    [10, 20, 30].includes(Number(rangeMinutes)) ? Number(rangeMinutes) : 20
  )
  const [situation, setSituation] = useState(profileToKey(profile))

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

  function handleSave() {
    const sitObj = SITUATIONS.find(s => s.key === situation)
    onSave({
      rangeMinutes: range,
      profile: sitObj?.profile ?? {},
    })
  }

  const orangeGrad = 'linear-gradient(135deg, #f59648 0%, #f47c20 52%, #e06818 100%)'

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      role="dialog" aria-modal="true" aria-label="Change search conditions"
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 16px',
          borderBottom: '1.5px solid #f3f4f6',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4 }}>
              Settings
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#101828' }}>
              Change Conditions
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: 'unset', cursor: 'pointer', width: 32, height: 32,
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f3f4f6', fontSize: 17, color: '#4b5563', marginTop: 2,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Range */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#374151', marginBottom: 10 }}>
              Neighbourhood Range
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {RANGES.map(r => {
                const active = r === range
                return (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    style={{
                      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                      padding: '10px 0', borderRadius: 10, fontFamily: 'Figtree, sans-serif',
                      fontSize: 14, fontWeight: 700,
                      border: active ? 'none' : '1.5px solid #e5e7eb',
                      background: active ? orangeGrad : '#f9fafb',
                      color: active ? '#fff' : '#374151',
                      boxShadow: active ? '0 3px 10px rgba(244,124,32,0.3)' : 'none',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = '#f47c20' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#e5e7eb' }}
                  >
                    {r} min
                  </button>
                )
              })}
            </div>
          </div>

          {/* Situation */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#374151', marginBottom: 10 }}>
              Situation
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SITUATIONS.map(s => {
                const active = s.key === situation
                return (
                  <button
                    key={s.key}
                    onClick={() => setSituation(s.key)}
                    style={{
                      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                      width: '100%', padding: '11px 16px', borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 12,
                      border: active ? '1.5px solid #f47c20' : '1.5px solid #e5e7eb',
                      background: active ? '#fff7ed' : '#f9fafb',
                      transition: 'all 0.15s', fontFamily: 'Figtree, sans-serif',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#f47c20'; e.currentTarget.style.background = '#fff7ed' } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb' } }}
                  >
                    <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{s.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: active ? '#f47c20' : '#374151' }}>
                      {s.label}
                    </span>
                    {active && (
                      <span style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', background: '#f47c20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0 24px 22px',
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={onClose}
            style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
              padding: '12px 0', borderRadius: 10, fontFamily: 'Figtree, sans-serif',
              fontSize: 14, fontWeight: 700, color: '#374151',
              border: '1.5px solid #e5e7eb', background: '#f9fafb',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              all: 'unset', cursor: 'pointer', flex: 2, textAlign: 'center',
              padding: '12px 0', borderRadius: 10, fontFamily: 'Figtree, sans-serif',
              fontSize: 14, fontWeight: 800, color: '#fff',
              background: orangeGrad,
              boxShadow: '0 3px 10px rgba(244,124,32,0.35)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  )
}

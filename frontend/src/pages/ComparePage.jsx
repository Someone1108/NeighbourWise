import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import {
  getLiveabilityScore,
  searchAddresses,
  searchLocalities,
} from '../services/api.js'
import {
  clearCompareList,
  loadCompareList,
  removeFromCompareList,
  saveCompareList,
} from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

const CATEGORY_META = {
  accessibility: { label: 'Accessibility', icon: '🚌', tint: 'rgba(8, 145, 178, 0.12)' },
  safety: { label: 'Safety', icon: '🛡', tint: 'rgba(244, 124, 32, 0.12)' },
  environment: { label: 'Environment', icon: '🌿', tint: 'rgba(42, 157, 143, 0.12)' },
}

function safeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

function labelForCategory(key) {
  return CATEGORY_META[key]?.label || key
}

function getLocationLabel(item) {
  return (
    item?.displayName ||
    item?.fullAddress ||
    item?.locationName ||
    item?.name ||
    ''
  )
}

function isPostcodeQuery(value) {
  return /^\d{4}$/.test(String(value || '').trim())
}

function miniProgress(score, outOf = 100) {
  const s = Number.isFinite(score) ? score : 0
  const o = Number.isFinite(outOf) && outOf > 0 ? outOf : 100
  const percent = Math.max(0, Math.min(100, (s / o) * 100))

  return (
    <div className="nwProgressOuter nwMiniProgressOuter">
      <div
        className="nwProgressInner"
        style={{ width: `${percent}%`, height: '100%' }}
      />
    </div>
  )
}

export default function ComparePage() {
  const navigate = useNavigate()

  const [compareList, setCompareList] = useState(() => loadCompareList())
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [suburbResults, setSuburbResults] = useState([])
  const [addressResults, setAddressResults] = useState([])
  const [addingIndex, setAddingIndex] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [data, setData] = useState(null)

  const firstArea = compareList[0] || null
  const secondArea = compareList[1] || null
  const activeSecondArea = secondArea

  const hasResults = suburbResults.length > 0 || addressResults.length > 0
  const postcodeSearch = isPostcodeQuery(searchTerm)


  useEffect(() => {
    const query = searchTerm.trim()

    if (addingIndex === null) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

    if (!postcodeSearch && query.length < 3) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

    const words = query.toLowerCase().split(/\s+/).filter(Boolean)

    function dedupeAndFilter(arr) {
      const seen = new Set()
      return arr.filter((item) => {
        const label = (item.displayName || item.fullAddress || item.name || '').toLowerCase()
        const key = label
        if (seen.has(key)) return false
        seen.add(key)
        return words.every((w) => label.includes(w))
      })
    }

    let cancelled = false
    setSearching(true)

    const timer = setTimeout(() => {
      Promise.allSettled([searchLocalities(query), searchAddresses(query)])
        .then((results) => {
          if (cancelled) return

          const localities =
            results[0].status === 'fulfilled' && Array.isArray(results[0].value)
              ? results[0].value
              : []

          const addresses =
            results[1].status === 'fulfilled' && Array.isArray(results[1].value)
              ? results[1].value
              : []

          setSuburbResults(dedupeAndFilter(localities))
          setAddressResults(dedupeAndFilter(addresses))
        })
        .finally(() => {
          if (cancelled) return
          setSearching(false)
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm, addingIndex, postcodeSearch])

  useEffect(() => {
    if (!firstArea) {
      setHint('No area has been saved yet. Add one area from the map page first.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    if (!activeSecondArea) {
      setHint('Search and select a second suburb, postcode, or address to compare.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    const firstLat = Number(firstArea.lat ?? firstArea.selectedLocation?.lat)
    const firstLng = Number(firstArea.lng ?? firstArea.selectedLocation?.lng)
    const secondLat = Number(activeSecondArea.lat ?? activeSecondArea.selectedLocation?.lat)
    const secondLng = Number(activeSecondArea.lng ?? activeSecondArea.selectedLocation?.lng)

    if (!Number.isFinite(firstLat) || !Number.isFinite(firstLng)) {
      setError('Missing coordinates for the first area. Please re-add it from the map.')
      setLoading(false)
      return
    }

    if (!Number.isFinite(secondLat) || !Number.isFinite(secondLng)) {
      setError('Missing coordinates for the second area. Please select a different location.')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setHint('')

    const firstTime = safeRangeMinutes(firstArea.rangeMinutes)
    const secondTime = safeRangeMinutes(activeSecondArea.rangeMinutes ?? firstArea.rangeMinutes)

    Promise.all([
      getLiveabilityScore({
        lat: firstLat,
        lng: firstLng,
        time: firstTime,
        persona: firstArea.profile || 'default',
      }),
      getLiveabilityScore({
        lat: secondLat,
        lng: secondLng,
        time: secondTime,
        persona: activeSecondArea.profile || firstArea.profile || 'default',
      }),
    ])
      .then(([r1, r2]) => {
        if (cancelled) return

        const scores = {
          accessibility: [
            Math.round(r1.scores?.accessibility ?? 0),
            Math.round(r2.scores?.accessibility ?? 0),
          ],
          safety: [
            Math.round(r1.scores?.safety ?? 0),
            Math.round(r2.scores?.safety ?? 0),
          ],
          environment: [
            Math.round(r1.scores?.environment ?? 0),
            Math.round(r2.scores?.environment ?? 0),
          ],
        }

        const overall1 = Math.round(r1.liveabilityScore ?? 0)
        const overall2 = Math.round(r2.liveabilityScore ?? 0)

        const deltas = [
          { key: 'accessibility', delta: scores.accessibility[0] - scores.accessibility[1] },
          { key: 'safety', delta: scores.safety[0] - scores.safety[1] },
          { key: 'environment', delta: scores.environment[0] - scores.environment[1] },
        ]

        deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        const topDelta = deltas[0]

        let recommendation = 'Both areas are closely matched overall.'

        if (overall1 > overall2) {
          recommendation = `${firstArea.locationName} currently looks stronger overall, especially in ${labelForCategory(topDelta.key).toLowerCase()}.`
        } else if (overall2 > overall1) {
          recommendation = `${getLocationLabel(activeSecondArea)} currently looks stronger overall, especially in ${labelForCategory(topDelta.key).toLowerCase()}.`
        }

        setData({
          area1: firstArea.locationName,
          area2: getLocationLabel(activeSecondArea),
          range1: firstTime,
          range2: secondTime,
          overall1,
          overall2,
          scores,
          recommendation,
        })
      })
      .catch(() => {
        if (cancelled) return
        setError('Failed to load comparison data.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [firstArea, activeSecondArea])

  function onSelectArea(location) {
    if (addingIndex === null) return

    setError('')

    const newArea = {
      ...location,
      locationName: getLocationLabel(location),
      displayName: location.displayName || getLocationLabel(location),
      fullAddress: location.fullAddress || '',
      name: location.name || '',
      type: location.type || location.placeType || 'suburb',
      placeType: location.placeType || location.type || 'suburb',
      postcode: location.postcode || null,
      lat: location.lat,
      lng: location.lng,
      source: location.source || '',
      profile: firstArea?.profile || {},
      rangeMinutes: firstArea?.rangeMinutes || 20,
      selectedLocation: location,
    }

    const updated = [...compareList]
    updated[addingIndex] = newArea

    const compacted = updated.filter(Boolean)

    saveCompareList(compacted)
    setCompareList(compacted)

    setAddingIndex(null)
    setSearchTerm('')
    setSuburbResults([])
    setAddressResults([])
  }

  function removeSavedArea(areaItem) {
    const next = removeFromCompareList(areaItem)
    setCompareList(next)
  }

  

  const compareSubtitle = useMemo(() => {
    if (loading) return 'Loading comparison...'
    if (data) {
      return `${data.area1} (${data.range1} min) vs ${data.area2} (${data.range2} min)`
    }
    return 'Compare two shortlisted areas side by side'
  }, [loading, data])

  function shortLabel(str, max = 28) {
    if (!str) return ''
    return str.length > max ? str.slice(0, max - 1) + '…' : str
  }

  const winner = data
    ? data.overall1 > data.overall2
      ? 1
      : data.overall2 > data.overall1
        ? 2
        : 0
    : 0


  function renderAreaPanel(area, index) {
    const isAdding = addingIndex === index
    const areaLabel = `Area ${index + 1}`

    return (
      <div
        className={`nwCard nwComparePanel nwComparePanel--area${index + 1}`}
        role="region"
        aria-label={areaLabel}
      >
        <div className="nwCompareLabel" aria-hidden="true">{areaLabel}</div>

        {/* Scrollable content — grows to fill space, button stays at bottom */}
        <div className="nwComparePanelContent">
          {area ? (
            <>
              <h2 className="nwCompareAreaTitle" title={getLocationLabel(area)}>
                {shortLabel(getLocationLabel(area))}
              </h2>
              <p className="nwCompareAreaMeta">
                {safeRangeMinutes(area.rangeMinutes)}-minute travel range
              </p>
              <div className="nwChipRow">
                <span className="nwChip">✓ Area selected</span>
              </div>
            </>
          ) : (
            <>
              <p className="nwCompareEmptyText">No area selected yet.</p>
              {isAdding && (
                <div className="nwSearchBlock">
                  <input
                    className="nwInput nwSearchInput"
                    placeholder="Search suburb, postcode or address"
                    aria-label={`Search location for ${areaLabel}`}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setError('')
                    }}
                    autoComplete="off"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                  {searching ? (
                    <div className="nwSearchStatus" aria-live="polite" aria-atomic="true">Searching…</div>
                  ) : null}
                  {!searching && hasResults ? (
                    <div className="nwSearchResults" role="listbox" aria-label={`Search results for ${areaLabel}`}>
                      {suburbResults.map((result, i) => (
                        <button
                          key={`area-${index}-suburb-${result.id}-${i}`}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="nwSearchResultItem"
                          onClick={() => onSelectArea(result)}
                        >
                          <div className="nwSearchResultName">
                            {result.displayName || result.name}
                          </div>
                          <div className="nwSearchResultMeta">
                            {result.state || result.placeType || 'Suburb'}
                          </div>
                        </button>
                      ))}
                      {addressResults.map((result, i) => (
                        <button
                          key={`area-${index}-address-${result.id || result.displayName}-${i}`}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="nwSearchResultItem"
                          onClick={() => onSelectArea(result)}
                        >
                          <div className="nwSearchResultName">
                            {result.displayName || result.fullAddress || result.name}
                          </div>
                          <div className="nwSearchResultMeta">
                            {result.suburb
                              ? `${result.suburb}${result.postcode ? `, ${result.postcode}` : ''}`
                              : result.placeType || 'Address'}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Button row — always at the bottom of the card regardless of content state */}
        <div className="nwBtnRow">
          {area ? (
            <Button variant="secondary" onClick={() => removeSavedArea(area)}>
              Remove
            </Button>
          ) : !isAdding ? (
            <Button
              variant="primary"
              onClick={() => {
                setAddingIndex(index)
                setSearchTerm('')
                setSuburbResults([])
                setAddressResults([])
              }}
            >
              Add Area
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setAddingIndex(null)
                setSearchTerm('')
                setSuburbResults([])
                setAddressResults([])
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">Compare Areas</h1>
      <p className="nwSubtitle" aria-live="polite">
        {data
          ? `${shortLabel(data.area1, 22)} vs ${shortLabel(data.area2, 22)}`
          : 'Add two areas to compare them side by side'}
      </p>

      <div className="nwCompareTopGrid" role="group" aria-label="Select areas to compare">
        {renderAreaPanel(firstArea, 0)}
        {renderAreaPanel(secondArea, 1)}
      </div>

      <div className="nwCard nwCompareResultsCard">
        <div aria-live="polite" aria-atomic="true" style={{ minHeight: 24 }}>
          {loading ? (
            <div className="nwLoading">Loading comparison…</div>
          ) : hint ? (
            <div style={{ color: 'var(--muted-dark)', fontSize: 15, lineHeight: 1.6, padding: '8px 0' }}>
              {hint}
            </div>
          ) : null}
        </div>

        {!loading && error ? (
          <div className="nwError" role="alert" aria-live="assertive">{error}</div>
        ) : null}

        {!loading && data ? (
          <>
            <div className="nwCompareScoreSummary">
              <div
                className="nwCompareScoreBox"
                style={winner === 1 ? { borderColor: 'var(--accent-2)', background: 'var(--teal-bg)' } : {}}
              >
                {winner === 1 && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                    ★ Higher Score
                  </div>
                )}
                <div className="nwCompareScoreLabel" title={data.area1}>{shortLabel(data.area1)}</div>
                <div className="nwCompareScoreValue">{data.overall1}<span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted-dark)' }}> / 100</span></div>
              </div>

              <div className="nwCompareScoreDivider">vs</div>

              <div
                className="nwCompareScoreBox"
                style={winner === 2 ? { borderColor: 'var(--accent-2)', background: 'var(--teal-bg)' } : {}}
              >
                {winner === 2 && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-2)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                    ★ Higher Score
                  </div>
                )}
                <div className="nwCompareScoreLabel" title={data.area2}>{shortLabel(data.area2)}</div>
                <div className="nwCompareScoreValue">{data.overall2}<span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted-dark)' }}> / 100</span></div>
              </div>
            </div>

            <table className="nwCompareTable" aria-label="Comparison table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Category</th>
                  <th style={{ width: '36%' }} title={data.area1}>{shortLabel(data.area1, 22)}</th>
                  <th style={{ width: '36%' }} title={data.area2}>{shortLabel(data.area2, 22)}</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_KEYS.map((key) => {
                  const s1 = data.scores[key][0]
                  const s2 = data.scores[key][1]
                  const meta = CATEGORY_META[key] || {}
                  return (
                    <tr key={key}>
                      <td className="nwCompareRowTitle">
                        <span
                          className="nwCompareCategoryIcon"
                          style={{ background: meta.tint }}
                          aria-hidden="true"
                        >
                          {meta.icon}
                        </span>
                        {labelForCategory(key)}
                      </td>
                      <td style={s1 > s2 ? { background: 'rgba(42,157,143,0.06)' } : {}}>
                        <div className="nwCompareCellScore" style={s1 > s2 ? { color: 'var(--accent-2)' } : {}}>
                          {s1} / 100
                        </div>
                        {miniProgress(s1)}
                      </td>
                      <td style={s2 > s1 ? { background: 'rgba(42,157,143,0.06)' } : {}}>
                        <div className="nwCompareCellScore" style={s2 > s1 ? { color: 'var(--accent-2)' } : {}}>
                          {s2} / 100
                        </div>
                        {miniProgress(s2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div
              className="nwCompareRecommendation"
              style={{ borderLeftWidth: 4, borderLeftColor: 'var(--accent-2)', borderLeftStyle: 'solid', background: 'var(--teal-bg)' }}
            >
              <div className="nwCompareRecommendationTitle" style={{ color: 'var(--accent-2)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Our Recommendation
              </div>
              <p className="nwCompareRecommendationText" style={{ color: 'var(--text-dark)', fontWeight: 600, fontSize: 16, lineHeight: 1.6 }}>
                {data.recommendation}
              </p>
            </div>
          </>
        ) : null}

        <div className="nwBtnRow nwCompareFooterActions">
          <Button variant="primary" onClick={() => navigate('/map')}>
            Back to Map
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearCompareList()
              setCompareList([])
              setAddingIndex(null)
              setSearchTerm('')
              setData(null)
            }}
          >
            Clear All
          </Button>
        </div>
      </div>
    </div>
  )
}
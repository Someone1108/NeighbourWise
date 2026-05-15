import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
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

const CATEGORY_COLORS = {
  accessibility: { color: '#2563eb', soft: '#eff6ff', border: '#bfdbfe' },
  safety:        { color: '#059669', soft: '#ecfdf5', border: '#a7f3d0' },
  environment:   { color: '#ea580c', soft: '#fff7ed', border: '#fed7aa' },
}

// Candidate pool for "Find a Better Area" recommendations
const REC_POOL = [
  { name: 'Box Hill',       lat: -37.8195, lng: 145.1232, scores: { accessibility: 84, safety: 74, environment: 78, overall: 79 } },
  { name: 'Doncaster',      lat: -37.7831, lng: 145.1270, scores: { accessibility: 76, safety: 80, environment: 83, overall: 80 } },
  { name: 'Camberwell',     lat: -37.8243, lng: 145.0624, scores: { accessibility: 79, safety: 78, environment: 80, overall: 79 } },
  { name: 'Moonee Ponds',   lat: -37.7648, lng: 144.9163, scores: { accessibility: 80, safety: 73, environment: 74, overall: 76 } },
  { name: 'Essendon',       lat: -37.7491, lng: 144.9170, scores: { accessibility: 78, safety: 76, environment: 76, overall: 77 } },
  { name: 'Ringwood',       lat: -37.8162, lng: 145.2303, scores: { accessibility: 78, safety: 75, environment: 82, overall: 78 } },
  { name: 'Chadstone',      lat: -37.8846, lng: 145.0899, scores: { accessibility: 85, safety: 70, environment: 72, overall: 76 } },
  { name: 'Footscray',      lat: -37.7988, lng: 144.8997, scores: { accessibility: 82, safety: 63, environment: 67, overall: 71 } },
  { name: 'Frankston',      lat: -38.1431, lng: 145.1264, scores: { accessibility: 72, safety: 70, environment: 85, overall: 76 } },
  { name: 'Williamstown',   lat: -37.8570, lng: 144.8999, scores: { accessibility: 71, safety: 79, environment: 83, overall: 78 } },
  { name: 'Werribee',       lat: -37.8962, lng: 144.6628, scores: { accessibility: 68, safety: 75, environment: 81, overall: 75 } },
  { name: 'Glen Waverley',  lat: -37.8788, lng: 145.1634, scores: { accessibility: 80, safety: 78, environment: 82, overall: 80 } },
  { name: 'Dandenong',      lat: -37.9874, lng: 145.2162, scores: { accessibility: 75, safety: 65, environment: 71, overall: 70 } },
  { name: 'Heidelberg',     lat: -37.7563, lng: 145.0632, scores: { accessibility: 77, safety: 74, environment: 79, overall: 77 } },
  { name: 'Altona',         lat: -37.8695, lng: 144.8258, scores: { accessibility: 69, safety: 77, environment: 84, overall: 77 } },
]

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function findRecommendation(baselineScores, baseLat, baseLng, category) {
  const others = CATEGORY_KEYS.filter((k) => k !== category)
  const candidates = REC_POOL.filter((sub) => {
    if (sub.scores[category] <= baselineScores[category]) return false
    return others.every((k) => sub.scores[k] >= baselineScores[k] - 5)
  })
    .map((sub) => ({ ...sub, dist: haversineKm(baseLat, baseLng, sub.lat, sub.lng) }))
    .sort((a, b) => a.dist - b.dist)
  return candidates[0] || null
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

  // Recommendation feature state
  const [recCategory, setRecCategory] = useState(null)
  const [recBaseline, setRecBaseline] = useState(null)
  const [recResult, setRecResult] = useState(null)

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
      if (postcodeSearch) {
        searchAddresses(query)
          .then((rows) => {
            if (cancelled) return
            const list = Array.isArray(rows) ? rows : []
            setSuburbResults(dedupeAndFilter(list))
            setAddressResults([])
          })
          .catch((err) => {
            console.error('Compare search failed:', err)
            if (!cancelled) {
              setSuburbResults([])
              setAddressResults([])
            }
          })
          .finally(() => {
            if (cancelled) return
            setSearching(false)
          })
        return
      }

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

  function navigateToInsights(area) {
    navigate('/insights', {
      state: {
        selectedLocation: area.selectedLocation || {
          lat: area.lat,
          lng: area.lng,
          displayName: area.locationName || area.displayName || area.name,
          name: area.name,
          fullAddress: area.fullAddress,
        },
        profile: area.profile,
        rangeMinutes: area.rangeMinutes || 20,
      },
    })
  }

  function handleFindRecommendation() {
    if (!recCategory || !recBaseline || !data) return
    const idx = recBaseline === 1 ? 0 : 1
    const baselineScores = {
      accessibility: data.scores.accessibility[idx],
      safety: data.scores.safety[idx],
      environment: data.scores.environment[idx],
    }
    const baselineArea = recBaseline === 1 ? firstArea : secondArea
    const baseLat = Number(baselineArea?.lat ?? baselineArea?.selectedLocation?.lat)
    const baseLng = Number(baselineArea?.lng ?? baselineArea?.selectedLocation?.lng)

    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) {
      setRecResult({ noMatch: true })
      return
    }

    const result = findRecommendation(baselineScores, baseLat, baseLng, recCategory)
    if (!result) {
      setRecResult({ noMatch: true })
      return
    }

    const catLabel = CATEGORY_META[recCategory].label
    const baselineName = recBaseline === 1 ? data.area1 : data.area2
    const gain = result.scores[recCategory] - baselineScores[recCategory]
    setRecResult({
      ...result,
      baselineName,
      gain,
      reason: `${result.name} scores ${result.scores[recCategory]} in ${catLabel.toLowerCase()} — ${gain} point${gain !== 1 ? 's' : ''} higher than ${baselineName}. The other categories stay within a comparable range.`,
    })
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
              <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
                ✓ Area selected
              </p>
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
        <div className="nwBtnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
          {area ? (
            <>
              <Button variant="secondary" onClick={() => navigate('/map')}>
                🗺 View on Map
              </Button>
              <Button variant="secondary" onClick={() => navigateToInsights(area)}>
                📊 Detailed Insights
              </Button>
              <Button variant="secondary" onClick={() => removeSavedArea(area)}>
                Remove
              </Button>
            </>
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
    <div style={{ background: '#f5f0eb', minHeight: '100%', paddingBottom: 56 }}>
      {/* Sticky back-to-map nav — full viewport width, mirrors InsightsPage exactly */}
      <nav aria-label="Page navigation" style={{
        position: 'sticky', top: 64, zIndex: 50,
        background: 'rgba(245,240,235,0.95)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => navigate('/map')}
          aria-label="Go back to map"
          style={{
            width: 38, height: 38, borderRadius: 9,
            border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: '#374151', fontSize: 18, fontWeight: 700,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
          onFocus={e => { e.currentTarget.style.outline = '2px solid #2563eb'; e.currentTarget.style.outlineOffset = '2px' }}
          onBlur={e => { e.currentTarget.style.outline = 'none' }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#1a2436', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Back to Map
          </p>
          <p style={{ fontSize: 13, color: '#4b5563', marginTop: 3 }}>
            {data ? `${shortLabel(data.area1, 24)} vs ${shortLabel(data.area2, 24)}` : 'Compare two areas side by side'}
          </p>
        </div>
      </nav>

      <div className="nwPage" style={{ paddingTop: 24 }}>

      <div className="nwCompareTopGrid" role="group" aria-label="Select areas to compare">
        {renderAreaPanel(firstArea, 0)}
        {renderAreaPanel(secondArea, 1)}
      </div>

      <div className="nwCard nwCompareResultsCard" style={{ position: 'relative', minHeight: 120 }}>
        <LoadingOverlay show={loading} label="Loading comparison…" />

        <div aria-live="polite" aria-atomic="true" style={{ minHeight: 24 }}>
          {hint && !loading ? (
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
                Overall Verdict
              </div>
              <p className="nwCompareRecommendationText" style={{ color: 'var(--text-dark)', fontWeight: 600, fontSize: 16, lineHeight: 1.6 }}>
                {data.recommendation}
              </p>
            </div>

            {/* ── Find a Better Area ─────────────────────────── */}
            <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1.5px solid #e5e7eb', textAlign: 'center' }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 8 }}>
                Explore Further
              </p>
              <h3 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 400, color: '#1a2436', margin: '0 0 6px', lineHeight: 1.15 }}>
                What matters most to you?
              </h3>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                Select a category — we'll find a nearby area that scores higher in it.
              </p>

              {/* Category buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: recCategory ? 18 : 0, justifyContent: 'center' }}>
                {CATEGORY_KEYS.map((key) => {
                  const meta = CATEGORY_META[key]
                  const cc = CATEGORY_COLORS[key]
                  const active = recCategory === key
                  return (
                    <button
                      key={key}
                      onClick={() => { setRecCategory(key); setRecBaseline(null); setRecResult(null) }}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                        border: active ? `2px solid ${cc.color}` : '1.5px solid #e5e7eb',
                        background: active ? cc.soft : '#fff',
                        color: active ? cc.color : '#374151',
                        transition: 'all 0.15s',
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        boxShadow: active ? `0 2px 10px ${cc.color}28` : 'none',
                      }}
                    >
                      <span>{meta.icon}</span> {meta.label}
                    </button>
                  )
                })}
              </div>

              {/* Baseline picker */}
              {recCategory && (
                <div style={{
                  background: '#f8fafc', border: '1.5px solid #e5e7eb',
                  borderRadius: 12, padding: '14px 16px', marginBottom: 16,
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#374151', marginBottom: 10 }}>
                    Compare against which area?
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {[
                      { n: 1, label: data.area1, color: '#2a9d8f', soft: '#e8f7f5', border: '#9dd6cf' },
                      { n: 2, label: data.area2, color: '#f47c20', soft: '#fff3e7', border: '#ffc896' },
                    ].map(({ n, label, color, soft, border }) => {
                      const active = recBaseline === n
                      return (
                        <button
                          key={n}
                          onClick={() => { setRecBaseline(n); setRecResult(null) }}
                          style={{
                            all: 'unset', cursor: 'pointer',
                            padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                            border: active ? `2px solid ${color}` : '1.5px solid #e5e7eb',
                            background: active ? soft : '#fff',
                            color: active ? color : '#374151',
                            transition: 'all 0.15s',
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            boxShadow: active ? `0 2px 10px ${color}28` : 'none',
                          }}
                        >
                          <span style={{ fontSize: 11, opacity: 0.55 }}>Area {n}</span>
                          {shortLabel(label, 20)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Recommend button + result — constrained width, centred */}
              <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
                {recCategory && recBaseline && (
                  <button
                    onClick={handleFindRecommendation}
                    style={{
                      all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      padding: '14px 20px', borderRadius: 12,
                      background: 'linear-gradient(135deg, #f59648 0%, #f47c20 52%, #e06818 100%)',
                      color: '#fff', fontSize: 16, fontWeight: 800,
                      letterSpacing: '0.01em',
                      boxShadow: '0 4px 18px rgba(244,124,32,0.38)',
                      transition: 'opacity 0.15s, transform 0.15s',
                      marginBottom: 4,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
                  >
                    Recommend another suburb
                  </button>
                )}

                {/* Result card */}
                {recResult && (
                  recResult.noMatch ? (
                    <div style={{ marginTop: 14, padding: '14px 16px', background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 14, textAlign: 'center' }}>
                      <p style={{ fontSize: 14, color: '#92400e', fontWeight: 600 }}>
                        No nearby area found that scores higher in {CATEGORY_META[recCategory]?.label.toLowerCase()} while keeping other categories comparable. Try a different category.
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      marginTop: 14,
                      background: '#fff',
                      border: '1.5px solid #e5e7eb',
                      borderRadius: 16, overflow: 'hidden',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                      animation: 'nwRecFadeIn 0.35s ease both',
                    }}>
                      <style>{`@keyframes nwRecFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }`}</style>

                      {/* Header strip */}
                      <div style={{ background: 'linear-gradient(90deg, #1a1a2e, #0f3460)', padding: '16px 20px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                          Recommended Area
                        </p>
                        <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, color: '#fff', fontWeight: 400, marginBottom: 4 }}>
                          {recResult.name}
                        </p>
                        <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 40, color: '#fff', lineHeight: 1 }}>
                          {recResult.scores.overall}
                        </p>
                        <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>Overall Score</p>
                      </div>

                      <div style={{ padding: '18px 20px', textAlign: 'center' }}>
                        {/* Highlighted category */}
                        {(() => {
                          const cc = CATEGORY_COLORS[recCategory]
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: cc.soft, border: `1px solid ${cc.border}`, borderRadius: 10, padding: '7px 16px', marginBottom: 14 }}>
                              <span style={{ fontSize: 14 }}>{CATEGORY_META[recCategory].icon}</span>
                              <span style={{ fontSize: 13, fontWeight: 800, color: cc.color }}>
                                {CATEGORY_META[recCategory].label}: {recResult.scores[recCategory]}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, padding: '1px 7px' }}>
                                +{recResult.gain} pts
                              </span>
                            </div>
                          )
                        })()}

                        {/* Other category scores + distance */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, justifyContent: 'center' }}>
                          {CATEGORY_KEYS.filter(k => k !== recCategory).map(k => {
                            const cc = CATEGORY_COLORS[k]
                            return (
                              <span key={k} style={{ fontSize: 11, fontWeight: 800, background: cc.soft, color: cc.color, border: `1px solid ${cc.border}`, borderRadius: 6, padding: '3px 9px' }}>
                                {CATEGORY_META[k].label}: {recResult.scores[k]}
                              </span>
                            )
                          })}
                          {recResult.dist != null && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>
                              {recResult.dist.toFixed(1)} km from {recResult.baselineName}
                            </span>
                          )}
                        </div>

                        <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, marginBottom: 16 }}>
                          {recResult.reason}
                        </p>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button
                            onClick={() => navigate('/insights', {
                              state: {
                                selectedLocation: { lat: recResult.lat, lng: recResult.lng, displayName: recResult.name, name: recResult.name },
                                profile: firstArea?.profile,
                                rangeMinutes: firstArea?.rangeMinutes || 20,
                              }
                            })}
                            style={{
                              all: 'unset', cursor: 'pointer',
                              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                              background: 'linear-gradient(135deg, #f59648 0%, #f47c20 100%)',
                              color: '#fff',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              boxShadow: '0 2px 10px rgba(244,124,32,0.32)',
                              transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                          >
                            📊 See Detailed Insights
                          </button>
                          <button
                            onClick={() => navigate('/map')}
                            style={{
                              all: 'unset', cursor: 'pointer',
                              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                              background: '#fff', color: '#374151',
                              border: '1.5px solid #e5e7eb',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              transition: 'border-color 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb' }}
                          >
                            🗺 View on Map
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        ) : null}

        {/* Clear All — available while no comparison is loaded yet */}
        {!data && !loading && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => {
                clearCompareList()
                setCompareList([])
                setAddingIndex(null)
                setSearchTerm('')
                setData(null)
              }}
              style={{
                all: 'unset', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#9ca3af',
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      </div>

    </div>
  )
}
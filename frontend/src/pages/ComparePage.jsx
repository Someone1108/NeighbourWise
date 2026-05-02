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
  const [selectedSecondArea, setSelectedSecondArea] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [data, setData] = useState(null)

  const firstArea = compareList[0] || null
  const savedSecondArea = compareList[1] || null
  const activeSecondArea = savedSecondArea || selectedSecondArea

  const hasResults = suburbResults.length > 0 || addressResults.length > 0
  const postcodeSearch = isPostcodeQuery(searchTerm)

  useEffect(() => {
    if (savedSecondArea) {
      setSelectedSecondArea(null)
      setSearchTerm(getLocationLabel(savedSecondArea))
    }
  }, [savedSecondArea])

  useEffect(() => {
    const query = searchTerm.trim()
    const selectedText = getLocationLabel(selectedSecondArea)

    if (selectedSecondArea && query === selectedText) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
    }

    if (selectedSecondArea && query !== selectedText) {
      setSelectedSecondArea(null)
    }

    if (savedSecondArea) {
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
  }, [searchTerm, selectedSecondArea, savedSecondArea, postcodeSearch])

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

  function onSelectSecondArea(location) {
    setSelectedSecondArea(location)
    setSearchTerm(getLocationLabel(location))
    setSuburbResults([])
    setAddressResults([])
    setError('')
  }

  function removeSavedArea(areaItem) {
    const next = removeFromCompareList(areaItem)
    setCompareList(next)
  }

  function clearSecondSelection() {
    if (savedSecondArea) {
      const next = removeFromCompareList(savedSecondArea)
      setCompareList(next)
    }
    setSelectedSecondArea(null)
    setSearchTerm('')
    setSuburbResults([])
    setAddressResults([])
    setData(null)
    setHint('Search and select a second suburb, postcode, or address to compare.')
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

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">Compare Areas</h1>
      <p className="nwSubtitle">
        {data
          ? `${shortLabel(data.area1, 22)} vs ${shortLabel(data.area2, 22)}`
          : 'Add two areas to compare them side by side'}
      </p>

      <div className="nwCompareTopGrid">
        <div className="nwCard nwComparePanel nwComparePanel--area1">
          <div className="nwCompareLabel">Area 1</div>
          {firstArea ? (
            <>
              <h2 className="nwCompareAreaTitle" title={firstArea.locationName}>
                {shortLabel(firstArea.locationName)}
              </h2>
              <p className="nwCompareAreaMeta">
                {safeRangeMinutes(firstArea.rangeMinutes)}-minute travel range
              </p>
              <div className="nwChipRow">
                <span className="nwChip">✓ Saved from map</span>
              </div>
              <div className="nwBtnRow">
                <Button variant="secondary" onClick={() => removeSavedArea(firstArea)}>
                  Remove
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="nwCompareEmptyText">
                No first area saved yet. Search a suburb on the map and click "Add to Compare".
              </p>
              <div className="nwBtnRow">
                <Button variant="primary" onClick={() => navigate('/map')}>
                  Go to Map
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="nwCard nwComparePanel nwComparePanel--area2">
          <div className="nwCompareLabel">Area 2</div>

          {!activeSecondArea ? (
            <>
              <h2 className="nwCompareAreaTitle">Find a second area</h2>
              <p className="nwCompareAreaMeta" style={{ marginBottom: 12 }}>
                Type a suburb, postcode, or address below.
              </p>

              <div className="nwSearchBlock">
                <label
                  htmlFor="compare-search-input"
                  style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--muted-dark)', marginBottom: 6 }}
                >
                  Search suburb, postcode or address
                </label>
                <input
                  id="compare-search-input"
                  className="nwInput nwSearchInput"
                  placeholder="e.g. Richmond, 3076, or 45 Chapel St"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setError('')
                  }}
                  aria-autocomplete="list"
                  aria-expanded={hasResults && !selectedSecondArea}
                  autoComplete="off"
                />

                {searching ? <div className="nwSearchStatus">Searching…</div> : null}

                {!searching && hasResults && !selectedSecondArea ? (
                  <div className="nwSearchResults">
                    {suburbResults.length > 0 ? (
                      <div className="nwSearchGroupLabel">Suburbs</div>
                    ) : null}

                    {suburbResults.map((result, index) => (
                      <button
                        key={`compare-suburb-${result.id}-${index}`}
                        type="button"
                        className="nwSearchResultItem"
                        onClick={() => onSelectSecondArea(result)}
                      >
                        <div className="nwSearchResultName">
                          {result.displayName || result.name}
                        </div>
                        <div className="nwSearchResultMeta">
                          {result.state || result.placeType || 'Suburb'}
                        </div>
                      </button>
                    ))}

                    {addressResults.length > 0 ? (
                      <div className="nwSearchGroupLabel nwSearchGroupDivider">
                        {postcodeSearch ? 'Postcodes / addresses' : 'Addresses'}
                      </div>
                    ) : null}

                    {addressResults.map((result, index) => (
                      <button
                        key={`compare-address-${result.id || result.displayName}-${index}`}
                        type="button"
                        className="nwSearchResultItem"
                        onClick={() => onSelectSecondArea(result)}
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

                {!searching &&
                ((!postcodeSearch && searchTerm.trim().length >= 3) ||
                  postcodeSearch) &&
                !hasResults &&
                !selectedSecondArea ? (
                  <div className="nwSearchStatus">No results found — try a different name.</div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h2 className="nwCompareAreaTitle" title={getLocationLabel(activeSecondArea)}>
                {shortLabel(getLocationLabel(activeSecondArea))}
              </h2>
              <p className="nwCompareAreaMeta">
                {savedSecondArea
                  ? `${safeRangeMinutes(savedSecondArea.rangeMinutes)}-minute travel range`
                  : 'Selected on this page'}
              </p>
              <div className="nwChipRow">
                <span className="nwChip">✓ Area selected</span>
              </div>
              <div className="nwBtnRow">
                <Button variant="secondary" onClick={clearSecondSelection}>
                  Change area
                </Button>
              </div>
            </>
          )}
        </div>
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
              setSelectedSecondArea(null)
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
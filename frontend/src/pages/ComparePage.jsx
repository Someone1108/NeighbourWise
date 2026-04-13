import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import {
  getMapContext,
  searchAddresses,
  searchLocalities,
} from '../services/api.js'
import {
  clearCompareList,
  loadCompareList,
  removeFromCompareList,
} from '../utils/storage.js'

const CATEGORY_KEYS = ['accessibility', 'safety', 'environment']

function safeRangeMinutes(value) {
  const n = Number(value)
  if ([10, 20, 30].includes(n)) return n
  return 20
}

function labelForCategory(key) {
  const map = {
    accessibility: 'Accessibility',
    safety: 'Safety',
    environment: 'Environment',
  }
  return map[key] || key
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

    if (query.length < 3) {
      setSuburbResults([])
      setAddressResults([])
      setSearching(false)
      return
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

          setSuburbResults(localities)
          setAddressResults(addresses)
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
  }, [searchTerm, selectedSecondArea, savedSecondArea])

  useEffect(() => {
    if (!firstArea) {
      setHint('No area has been saved yet. Add one area from the map page first.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    if (!activeSecondArea) {
      setHint('Search and select a second suburb or address to compare.')
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setHint('')

    const firstPayload = {
      locationName: firstArea.locationName,
      rangeMinutes: safeRangeMinutes(firstArea.rangeMinutes),
      profile: firstArea.profile || {},
    }

    const secondPayload = {
      locationName: getLocationLabel(activeSecondArea),
      rangeMinutes: safeRangeMinutes(activeSecondArea.rangeMinutes),
      profile: activeSecondArea.profile || {},
    }

    Promise.all([getMapContext(firstPayload), getMapContext(secondPayload)])
      .then(([r1, r2]) => {
        if (cancelled) return

        const scores = {
          accessibility: [r1.scores.accessibility, r2.scores.accessibility],
          safety: [r1.scores.safety, r2.scores.safety],
          environment: [r1.scores.environment, r2.scores.environment],
        }

        const overall1 = Math.round(
          (scores.accessibility[0] + scores.safety[0] + scores.environment[0]) / 3
        )
        const overall2 = Math.round(
          (scores.accessibility[1] + scores.safety[1] + scores.environment[1]) / 3
        )

        const deltas = [
          {
            key: 'accessibility',
            delta: scores.accessibility[0] - scores.accessibility[1],
          },
          {
            key: 'safety',
            delta: scores.safety[0] - scores.safety[1],
          },
          {
            key: 'environment',
            delta: scores.environment[0] - scores.environment[1],
          },
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
          range1: safeRangeMinutes(firstArea.rangeMinutes),
          range2: safeRangeMinutes(activeSecondArea.rangeMinutes),
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

  function removeSavedArea(locationName) {
    const next = removeFromCompareList(locationName)
    setCompareList(next)
  }

  function clearSecondSelection() {
    if (savedSecondArea) {
      const next = removeFromCompareList(savedSecondArea.locationName)
      setCompareList(next)
    }
    setSelectedSecondArea(null)
    setSearchTerm('')
    setSuburbResults([])
    setAddressResults([])
    setData(null)
    setHint('Search and select a second suburb or address to compare.')
  }

  const compareSubtitle = useMemo(() => {
    if (loading) return 'Loading comparison...'
    if (data) {
      return `${data.area1} (${data.range1} min) vs ${data.area2} (${data.range2} min)`
    }
    return 'Compare two shortlisted areas side by side'
  }, [loading, data])

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">Compare Areas</h1>
      <p className="nwSubtitle">{compareSubtitle}</p>

      <div className="nwCompareTopGrid">
        <div className="nwCard nwComparePanel">
          <div className="nwCompareLabel">Area 1</div>
          {firstArea ? (
            <>
              <h2 className="nwCompareAreaTitle">{firstArea.locationName}</h2>
              <p className="nwCompareAreaMeta">
                Saved from map results · {safeRangeMinutes(firstArea.rangeMinutes)} minute range
              </p>

              <div className="nwChipRow">
                <span className="nwChip">Saved area</span>
                <span className="nwChip">Ready to compare</span>
              </div>

              <div className="nwBtnRow">
                <Button
                  variant="secondary"
                  onClick={() => removeSavedArea(firstArea.locationName)}
                >
                  Remove
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="nwCompareEmptyText">
                No first area has been saved yet.
              </p>
              <div className="nwBtnRow">
                <Button variant="primary" onClick={() => navigate('/map')}>
                  Go to Map
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="nwCard nwComparePanel">
          <div className="nwCompareLabel">Area 2</div>

          {!activeSecondArea ? (
            <>
              <h2 className="nwCompareAreaTitle">Search a second suburb or address</h2>
              <p className="nwCompareAreaMeta">
                Select another area here instead of going back to the home page.
              </p>

              <div className="nwSearchBlock">
                <input
                  className="nwInput nwSearchInput"
                  placeholder="Search second suburb or address"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setError('')
                  }}
                  aria-label="Search second suburb or address"
                  autoComplete="off"
                />

                {searching ? <div className="nwSearchStatus">Searching...</div> : null}

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
                          {result.state || 'Suburb'}
                        </div>
                      </button>
                    ))}

                    {addressResults.length > 0 ? (
                      <div className="nwSearchGroupLabel nwSearchGroupDivider">
                        Addresses
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
                searchTerm.trim().length >= 3 &&
                !hasResults &&
                !selectedSecondArea ? (
                  <div className="nwSearchStatus">No matching suburb or address found.</div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h2 className="nwCompareAreaTitle">{getLocationLabel(activeSecondArea)}</h2>
              <p className="nwCompareAreaMeta">
                {savedSecondArea
                  ? `Saved from map results · ${safeRangeMinutes(savedSecondArea.rangeMinutes)} minute range`
                  : 'Selected directly on this compare page'}
              </p>

              <div className="nwChipRow">
                <span className="nwChip">Second area selected</span>
                <span className="nwChip">Ready to compare</span>
              </div>

              <div className="nwBtnRow">
                <Button variant="secondary" onClick={clearSecondSelection}>
                  Choose another area
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="nwCard nwCompareResultsCard">
        {loading ? <div className="nwLoading">Loading comparison...</div> : null}
        {!loading && hint ? <div className="nwSubtitle">{hint}</div> : null}
        {!loading && error ? <div className="nwError">{error}</div> : null}

        {!loading && data ? (
          <>
            <div className="nwCompareScoreSummary">
              <div className="nwCompareScoreBox">
                <div className="nwCompareScoreLabel">{data.area1}</div>
                <div className="nwCompareScoreValue">{data.overall1} / 100</div>
              </div>
              <div className="nwCompareScoreDivider">vs</div>
              <div className="nwCompareScoreBox">
                <div className="nwCompareScoreLabel">{data.area2}</div>
                <div className="nwCompareScoreValue">{data.overall2} / 100</div>
              </div>
            </div>

            <table className="nwCompareTable" aria-label="Comparison table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Category</th>
                  <th>{data.area1}</th>
                  <th>{data.area2}</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_KEYS.map((key) => (
                  <tr key={key}>
                    <td className="nwCompareRowTitle">{labelForCategory(key)}</td>
                    <td>
                      <div className="nwCompareCellScore">{data.scores[key][0]} / 100</div>
                      {miniProgress(data.scores[key][0])}
                    </td>
                    <td>
                      <div className="nwCompareCellScore">{data.scores[key][1]} / 100</div>
                      {miniProgress(data.scores[key][1])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="nwCompareRecommendation">
              <div className="nwCompareRecommendationTitle">Recommendation</div>
              <p className="nwCompareRecommendationText">{data.recommendation}</p>
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
            Clear Compare List
          </Button>
        </div>
      </div>
    </div>
  )
}
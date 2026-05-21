import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ScoreBar from "../components/ScoreBar.jsx";
import NeighbourMap from "../components/NeighbourMap.jsx";
import Button from "../components/buttons/Button.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import Toast from "../components/Toast.jsx";
import CompareReplaceModal from "../components/CompareReplaceModal.jsx";
import {
  getMapContext,
  getLocalityPolygon,
  getLayerDataForSuburb,
  getLayerDataForAddress,
  getLiveabilityScore,
  prefetchInsightPageData,
  searchAddresses,
  searchLocalities,
  validateSearchInput
} from "../services/api.js";
import {
  addToCompareList,
  replaceCompareArea,
  loadCompareList,
  loadContext,
  saveContext
} from "../utils/storage.js";

const CATEGORY_KEYS = ["accessibility", "safety", "environment"];
const MAP_LAYER_KEYS = ["heat", "vegetation", "zoning"];
const SHOW_VIEW_DETAILS = true;

function asSafeNumber(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function getDisplayLocationName(selectedLocation) {
  if (!selectedLocation) return "";
  return (
    selectedLocation.displayName ||
    selectedLocation.fullAddress ||
    selectedLocation.name ||
    ""
  );
}

function getLocationKind(selectedLocation) {
  return selectedLocation?.placeType || selectedLocation?.type || "";
}

function getProfileLabel(profile) {
  if (!profile) return null;
  if (profile.familyWithChildren) return "Family";
  if (profile.elderly) return "Elderly";
  if (profile.petOwner) return "Pet Owner";
  return null;
}

function getSearchResultKey(item) {
  return String(item?.displayName || item?.fullAddress || item?.name || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCompactSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function matchesSearchQuery(label, query, words) {
  const compactLabel = getCompactSearchText(label);
  const compactQuery = getCompactSearchText(query);

  return (
    words.every((word) => label.includes(word)) ||
    (compactQuery.length >= 3 && compactLabel.includes(compactQuery))
  );
}

function getSearchResultLabel(item) {
  return item?.displayName || item?.fullAddress || item?.name || "Unknown location";
}

function getSearchResultMeta(item) {
  if (item?.suburb) {
    return `${item.suburb}${item.postcode ? `, ${item.postcode}` : ""}`;
  }

  return item?.state || item?.placeType || item?.type || "Location";
}

export default function MapPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapData, setMapData] = useState(null);
  const [suburbPolygon, setSuburbPolygon] = useState(null);
  const [rangeMinutes, setRangeMinutes] = useState(20);
  const [poiData, setPoiData] = useState([]);
  const [showInsights, setShowInsights] = useState(true);
  const [activeLayer, setActiveLayer] = useState("none");
  const [layerData, setLayerData] = useState(null);
  const [useSuburbBoundary, setUseSuburbBoundary] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastAction, setToastAction] = useState(null);
  const [replaceModal, setReplaceModal] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const context = useMemo(() => {
    const stateCtx = location.state;
    const stored = loadContext();
    const merged = stateCtx || stored;
    return merged || null;
  }, [location.state]);

  const selectedLocation = context?.selectedLocation;
  const locationName = getDisplayLocationName(selectedLocation);
  const profile = context?.profile;
  const locationKind = getLocationKind(selectedLocation);

  const isSuburb = locationKind === "suburb" || locationKind === "locality";

  const isAddress =
    locationKind === "address" ||
    locationKind === "street" ||
    locationKind === "postcode";

  const scoreValue = Number(
    scoreData?.liveabilityScore ?? mapData?.overallScore
  );
  const overallScore = Number.isFinite(scoreValue) ? scoreValue : null;
  const overallScoreDisplay =
    overallScore === null ? "–" : Math.round(overallScore);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const query = searchTerm.trim();

    if (query.length < 3 && !/^\d{4}$/.test(query)) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let cancelled = false;
    setSearching(true);

    const timer = window.setTimeout(() => {
      const postcodeOnly = /^\d{4}$/.test(query);
      const searchPromise = postcodeOnly
        ? searchAddresses(query).then((rows) => [rows, []])
        : Promise.allSettled([searchLocalities(query), searchAddresses(query)]).then((results) => [
            results[0].status === "fulfilled" && Array.isArray(results[0].value)
              ? results[0].value
              : [],
            results[1].status === "fulfilled" && Array.isArray(results[1].value)
              ? results[1].value
              : []
          ]);

      searchPromise
        .then(([localities, addresses]) => {
          if (cancelled) return;
          const seen = new Set();
          const combined = [...localities, ...addresses].filter((item) => {
            const key = getSearchResultKey(item);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return matchesSearchQuery(key, query, words);
          });
          setSearchResults(combined);
        })
        .catch((err) => {
          console.error("Map search failed:", err);
          if (!cancelled) {
            setSearchResults([]);
            setSearchError("Search failed. Please try again.");
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  function handleSearchSelect(nextLocation) {
    const nextContext = {
      selectedLocation: nextLocation,
      profile,
      rangeMinutes
    };

    setSearchTerm("");
    setSearchResults([]);
    setSearchError("");
    saveContext(nextContext);
    navigate("/map", { state: nextContext, replace: true });
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const validation = validateSearchInput(searchTerm);

    if (!validation.ok) {
      setSearchError(validation.message);
      return;
    }

    if (searchResults.length === 1) {
      handleSearchSelect(searchResults[0]);
      return;
    }

    setSearchError("Choose an area from the search results.");
  }

  useEffect(() => {
    if (!context || !selectedLocation || !profile) {
      setError("Missing selected location. Please start from Home.");
      setLoading(false);
      return;
    }

    setRangeMinutes(asSafeNumber(context.rangeMinutes, 20));
  }, [context, selectedLocation, profile]);

  useEffect(() => {
    if (!context || !selectedLocation || !profile) return;

    let cancelled = false;

    setLoading(true);
    setError("");
    setSuburbPolygon(null);
    setLayerData(null);
    setUseSuburbBoundary(false);

    saveContext({ selectedLocation, profile, rangeMinutes });

    const mapContextPromise = getMapContext({
      locationName:
        selectedLocation.displayName ||
        selectedLocation.fullAddress ||
        selectedLocation.name,
      rangeMinutes,
      profile
    });

    const polygonPromise = isSuburb
      ? getLocalityPolygon(selectedLocation.name).catch((err) => {
          console.warn("Suburb polygon unavailable; using point radius instead:", err);
          return null;
        })
      : Promise.resolve(null);

    const scorePromise = getLiveabilityScore({
      lat: Number(selectedLocation.lat),
      lng: Number(selectedLocation.lng),
      time: Number(rangeMinutes),
      persona: profile || "default"
    });

    Promise.all([
      mapContextPromise,
      polygonPromise,
      scorePromise
    ])
      .then(([data, polygon, scores]) => {
        if (cancelled) return;

        setMapData(data);
        setSuburbPolygon(polygon);
        setUseSuburbBoundary(Boolean(polygon && isSuburb));
        setPoiData(scores?.breakdown?.accessibility?.pois || []);
        setScoreData(scores);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("MapPage load error:", err);
        setError(
          isAddress
            ? "Failed to load postcode/address map data."
            : "Failed to load suburb map data."
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, selectedLocation, profile, rangeMinutes, isSuburb, isAddress]);

  useEffect(() => {
    if (loading || error || !selectedLocation) return;

    let cancelled = false;
    const lat = Number(selectedLocation.lat);
    const lng = Number(selectedLocation.lng);

    async function loadLayerInBackground(layerKey) {
      const layers = isSuburb
        ? await getLayerDataForSuburb(selectedLocation.name, layerKey).catch((err) => {
            console.warn("Suburb layer unavailable; using point radius layer instead:", err);
            return getLayerDataForAddress(lat, lng, rangeMinutes, layerKey);
          })
        : isAddress
          ? await getLayerDataForAddress(lat, lng, rangeMinutes, layerKey)
          : null;

      if (cancelled || !layers) return;

      setLayerData((current) => ({
        ...(current || {}),
        suburb: layers.suburb ?? current?.suburb,
        address: layers.address ?? current?.address,
        analysisArea: layers.analysisArea ?? current?.analysisArea,
        boundary: layers.boundary ?? current?.boundary,
        [layerKey]: layers[layerKey]
      }));
    }

    async function loadLayersInBackground() {
      for (const layerKey of MAP_LAYER_KEYS) {
        if (cancelled) return;
        try {
          await loadLayerInBackground(layerKey);
        } catch (err) {
          if (!cancelled) {
            console.error(`${layerKey} layer background load error:`, err);
          }
        }
      }
    }

    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(loadLayersInBackground, { timeout: 1000 })
        : window.setTimeout(loadLayersInBackground, 300);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [loading, error, selectedLocation, rangeMinutes, isSuburb, isAddress]);

  useEffect(() => {
    if (loading || error || !selectedLocation || !profile) return;

    let cancelled = false;
    const runPrefetch = () => {
      if (cancelled) return;
      prefetchInsightPageData({ selectedLocation, profile, rangeMinutes });
    };

    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(runPrefetch, { timeout: 1500 })
        : window.setTimeout(runPrefetch, 500);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [loading, error, selectedLocation, profile, rangeMinutes]);

  if (error) {
    return (
      <div className="nwPage">
        <h1 className="nwPageTitle">Map</h1>
        <div className="nwError">{error}</div>
        <div className="nwBtnRow">
          <Button variant="primary" onClick={() => navigate("/")}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="nwPage">
      <div
        className="nwMapHeader"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px 18px",
          marginBottom: 18
        }}
      >
        <div className="nwMapTitleGroup">
          <h1 className="nwPageTitle" style={{ marginBottom: 0 }}>
            {String(locationName || "Neighbourhood Map")}
          </h1>
          <span
            style={{
              fontSize: 15,
              color: "var(--muted-dark)",
              fontWeight: 500
            }}
          >
            Liveability Map
          </span>
        </div>

        <section className="nwMapSearchCard" aria-label="Explore another area">
          <form className="nwMapSearchForm" onSubmit={handleSearchSubmit}>
            <div className="nwMapSearchInputWrap">
              <input
                id="map-search-input"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setSearchError("");
                }}
                placeholder="Search another suburb, postcode, or address"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={searchResults.length > 0}
                aria-controls={searchResults.length > 0 ? "map-search-results" : undefined}
                aria-describedby={searchError ? "map-search-error" : undefined}
              />
              <button type="submit" aria-label="Search another area">
                ⌕
              </button>
            </div>
          </form>

          {searching && (
            <div className="nwMapSearchStatus" aria-live="polite">
              Searching...
            </div>
          )}

          {searchResults.length > 0 && (
            <div
              id="map-search-results"
              className="nwMapSearchResults"
              role="listbox"
              aria-label="Map search results"
            >
              {searchResults.map((item, index) => (
                <button
                  key={`${item.id || getSearchResultKey(item)}-${index}`}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => handleSearchSelect(item)}
                >
                  <span>{getSearchResultLabel(item)}</span>
                  <small>{getSearchResultMeta(item)}</small>
                </button>
              ))}
            </div>
          )}

          {searchError && (
            <p id="map-search-error" className="nwMapSearchError" role="alert">
              {searchError}
            </p>
          )}
        </section>
      </div>

      <div className="nwMapLayout nwMapLayoutPolished">
        <section
          className="nwMapLeft"
          aria-label="Interactive neighbourhood map"
        >
          {loading && (
            <LoadingOverlay label="Loading map data…" />
          )}

          <NeighbourMap
            coordinates={
              selectedLocation
                ? {
                    lat: Number(selectedLocation.lat),
                    lng: Number(selectedLocation.lng)
                  }
                : mapData?.coordinates
            }
            radiusMeters={mapData?.radiusMeters}
            pointsOfInterest={showInsights ? poiData : []}
            suburbPolygon={useSuburbBoundary ? suburbPolygon : null}
            selectedLabel={locationName}
            heatLayer={activeLayer === "heat" ? layerData?.heat : null}
            vegetationLayer={
              activeLayer === "vegetation" ? layerData?.vegetation : null
            }
            zoningLayer={activeLayer === "zoning" ? layerData?.zoning : null}
            activeLayer={activeLayer}
          />

          <div className="nwMapFloatingBar" role="group" aria-label="Map actions">
            <Button
              variant="accent"
              onClick={() => {
                const compareItem = {
                  id: selectedLocation?.id || "",
                  locationName: locationName,
                  displayName:
                    selectedLocation?.displayName ||
                    selectedLocation?.fullAddress ||
                    selectedLocation?.name ||
                    "",
                  fullAddress: selectedLocation?.fullAddress || "",
                  name: selectedLocation?.name || "",
                  type:
                    selectedLocation?.type ||
                    selectedLocation?.placeType ||
                    "suburb",
                  placeType:
                    selectedLocation?.placeType ||
                    selectedLocation?.type ||
                    "suburb",
                  postcode: selectedLocation?.postcode || null,
                  lat: selectedLocation?.lat,
                  lng: selectedLocation?.lng,
                  source: selectedLocation?.source || "",
                  profile,
                  rangeMinutes,
                  selectedLocation
                };

                const result = addToCompareList(compareItem);
                if (result.reason === "ALREADY_EXISTS") {
                  setToastMsg("Already in your compare list.");
                  setToastAction({ label: "Go to Compare", onClick: () => navigate("/compare") });
                  return;
                }
                if (result.reason === "COMPARE_FULL") {
                  setToastMsg("");
                  setToastAction(null);
                  setReplaceModal({
                    pendingItem: compareItem,
                    currentList: result.current || result.list || loadCompareList()
                  });
                  return;
                }
                if (result.success) {
                  setToastMsg(`Added to compare (${result.list.length}/2).`);
                  setToastAction({ label: "Go to Compare", onClick: () => navigate("/compare") });
                  return;
                }
                setToastMsg("Unable to add this area to compare.");
                setToastAction(null);
              }}
            >
              Add to Compare
            </Button>

            {SHOW_VIEW_DETAILS && (
              <Button
                variant="primary"
                className="nwMapDetailsCta"
                onClick={() => {
                  saveContext({ selectedLocation, profile, rangeMinutes });
                  navigate("/insights", {
                    state: { selectedLocation, profile, rangeMinutes }
                  });
                }}
              >
                See Detailed Insights
              </Button>
            )}
            
          </div>
        </section>

        <aside className="nwMapRight">
          <div className="nwCard nwMapSidebarCard" style={{ textAlign: "left" }}>
            <div className="nwScoreHeader" aria-label="Liveability scores">
              <div className="nwScoreHeaderTop">
                <div className="nwScoreHeaderInfo">
                  <div
                    className="nwScoreHeaderEyebrow"
                    id="liveability-score-label"
                  >
                    {String(locationName || "").toUpperCase()}
                  </div>
                  <h2 className="nwScoreHeaderTitle">
                    Overall Liveability
                  </h2>
                  {getProfileLabel(profile) && (
                    <div className="nwScoreHeaderProfile">
                      Scored for: {getProfileLabel(profile)}
                    </div>
                  )}
                </div>

                <div
                  className="nwScoreDonut"
                  aria-labelledby="liveability-score-label"
                  aria-live="polite"
                  style={{
                    "--nw-score": overallScore ?? 0
                  }}
                >
                  <div className="nwScoreDonutInner">
                    <div className="nwScoreDonutValue">
                      {overallScoreDisplay}
                    </div>
                    <div className="nwScoreDonutOf">/100</div>
                  </div>
                </div>
              </div>

              <div className="nwScoreHeaderBars">
                {CATEGORY_KEYS.map((k) => (
                  <ScoreBar
                    key={k}
                    category={k}
                    score={scoreData?.scores?.[k]}
                    outOf={100}
                  />
                ))}
              </div>
            </div>

            <hr
              style={{
                border: "none",
                borderTop: "1px solid var(--border-light)",
                margin: "12px 0"
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, justifyContent: "space-evenly" }}>
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted-dark)",
                    marginBottom: 6,
                    padding: 0
                  }}
                >
                  Neighbourhood Range
                </legend>

                <div style={{ display: "flex", gap: 6 }}>
                  {[10, 20, 30].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`nwRangeBtn ${
                        rangeMinutes === m ? "nwRangeBtnActive" : ""
                      }`}
                      style={{
                        flex: 1,
                        padding: "11px 4px",
                        fontSize: 13,
                        margin: 0
                      }}
                      onClick={() => setRangeMinutes(m)}
                      aria-pressed={rangeMinutes === m}
                      aria-label={`${m} minute travel time`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted-dark)",
                    marginBottom: 6,
                    padding: 0
                  }}
                >
                  Nearby Amenities
                </legend>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className={`nwRangeBtn ${
                      showInsights ? "nwRangeBtnActive" : ""
                    }`}
                    style={{
                      flex: 1,
                      padding: "11px 4px",
                      fontSize: 13,
                      margin: 0
                    }}
                    onClick={() => setShowInsights(true)}
                    aria-pressed={showInsights}
                  >
                    Show
                  </button>

                  <button
                    type="button"
                    className={`nwRangeBtn ${
                      !showInsights ? "nwRangeBtnActive" : ""
                    }`}
                    style={{
                      flex: 1,
                      padding: "11px 4px",
                      fontSize: 13,
                      margin: 0
                    }}
                    onClick={() => setShowInsights(false)}
                    aria-pressed={!showInsights}
                  >
                    Hide
                  </button>
                </div>
              </fieldset>

              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted-dark)",
                    marginBottom: 6,
                    padding: 0
                  }}
                >
                  Map Layer
                </legend>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6
                  }}
                  role="radiogroup"
                  aria-label="Select map layer"
                >
                  {[
                    { key: "none", label: "Default" },
                    { key: "heat", label: "🌡 Heat" },
                    { key: "vegetation", label: "🌳 Vegetation" },
                    { key: "zoning", label: "🏙 Zoning" }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`nwRangeBtn ${
                        activeLayer === key ? "nwRangeBtnActive" : ""
                      }`}
                      style={{
                        padding: "11px 4px",
                        fontSize: 13,
                        margin: 0,
                        textAlign: "center"
                      }}
                      onClick={() => setActiveLayer(key)}
                      aria-pressed={activeLayer === key}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        </aside>
      </div>

      {replaceModal && (
        <CompareReplaceModal
          pendingItem={replaceModal.pendingItem}
          currentList={replaceModal.currentList}
          onReplace={(index) => {
            replaceCompareArea(index, replaceModal.pendingItem);
            setReplaceModal(null);
            setToastMsg("Compare area replaced.");
            setToastAction({ label: "Go to Compare", onClick: () => navigate("/compare") });
          }}
          onClose={() => setReplaceModal(null)}
          onGoToCompare={() => navigate("/compare")}
        />
      )}

      <Toast
        message={toastMsg}
        duration={toastAction ? 0 : 2400}
        action={toastAction}
        onClose={() => { setToastMsg(""); setToastAction(null); }}
      />
    </div>
  );
}

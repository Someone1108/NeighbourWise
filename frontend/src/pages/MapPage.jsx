import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ScoreBar from "../components/ScoreBar.jsx";
import NeighbourMap from "../components/NeighbourMap.jsx";
import Button from "../components/buttons/Button.jsx";
import {
  getMapContext,
  getLocalityPolygon,
  getPoiInsights,
  getLayerDataForSuburb,
  getLayerDataForAddress,
  getLiveabilityScore,
  prefetchInsightPageData
} from "../services/api.js";
import {
  addToCompareList,
  loadCompareList,
  loadContext,
  saveContext
} from "../utils/storage.js";

const CATEGORY_KEYS = ["accessibility", "safety", "environment"];
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

export default function MapPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapData, setMapData] = useState(null);
  const [suburbPolygon, setSuburbPolygon] = useState(null);
  const [rangeMinutes, setRangeMinutes] = useState(20);
  const [compareHint, setCompareHint] = useState("");
  const [poiData, setPoiData] = useState([]);
  const [showInsights, setShowInsights] = useState(true);
  const [activeLayer, setActiveLayer] = useState("none");
  const [layerData, setLayerData] = useState(null);

  const [scoreData, setScoreData] = useState(null);

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
      ? getLocalityPolygon(selectedLocation.name)
      : Promise.resolve(null);

    const poiPromise = getPoiInsights({
      lat: Number(selectedLocation.lat),
      lng: Number(selectedLocation.lng),
      time: Number(rangeMinutes)
    });

    const layerPromise = isSuburb
      ? getLayerDataForSuburb(selectedLocation.name)
      : isAddress
        ? getLayerDataForAddress(
            Number(selectedLocation.lat),
            Number(selectedLocation.lng),
            rangeMinutes
          )
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
      poiPromise,
      layerPromise,
      scorePromise
    ])
      .then(([data, polygon, poiResponse, layers, scores]) => {
        if (cancelled) return;

        setMapData(data);
        setSuburbPolygon(polygon);
        setPoiData(poiResponse?.results || []);
        setLayerData(layers);
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
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "0 12px",
          marginBottom: 18
        }}
      >
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

      <div className="nwMapLayout nwMapLayoutPolished">
        <section
          className="nwMapLeft"
          aria-label="Interactive neighbourhood map"
        >
          <div aria-live="polite" aria-atomic="true" className="nwSrOnly">
            {loading ? "Loading map data, please wait…" : ""}
          </div>

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
            suburbPolygon={isSuburb ? suburbPolygon : null}
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

                const list = addToCompareList(compareItem);
                setCompareHint(`Added to compare (${list.length}/2).`);
                navigate("/compare");
              }}
            >
              Add to Compare
            </Button>

            {SHOW_VIEW_DETAILS && (
              <Button
                variant="primary"
                onClick={() => {
                  saveContext({ selectedLocation, profile, rangeMinutes });
                  navigate("/insights", {
                    state: { selectedLocation, profile, rangeMinutes }
                  });
                }}
              >
                View Details
              </Button>
            )}

            <Button
              variant="dark"
              onClick={() => {
                const count = loadCompareList().length;
                if (count < 2) {
                  setCompareHint(
                    "Please add two areas before opening Compare."
                  );
                  return;
                }
                navigate("/compare");
              }}
            >
              Compare Areas
            </Button>
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
                  {(() => {
                    const s = overallScore;
                    let tier = { label: "—", className: "is-na" };
                    if (Number.isFinite(s)) {
                      if (s >= 80) tier = { label: "Excellent", className: "is-excellent" };
                      else if (s >= 65) tier = { label: "Good", className: "is-good" };
                      else if (s >= 50) tier = { label: "Moderate", className: "is-moderate" };
                      else tier = { label: "Low", className: "is-low" };
                    }
                    return (
                      <span className={`nwScoreTier ${tier.className}`}>
                        <span className="nwScoreTierDot" aria-hidden="true" />
                        {tier.label}
                      </span>
                    );
                  })()}
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

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted-dark)",
                    marginBottom: 4,
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
                        padding: "8px 4px",
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
                    marginBottom: 4,
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
                      padding: "8px 4px",
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
                      padding: "8px 4px",
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
                    marginBottom: 4,
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
                        padding: "8px 4px",
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

      <div role="status" aria-live="polite" className="nwMapActionsHint">
        {compareHint || ""}
      </div>
    </div>
  );
}

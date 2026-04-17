import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderToStaticMarkup } from "react-dom/server";

// MUI Icons
import LocalFloristIcon from "@mui/icons-material/LocalFlorist";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import TrainIcon from "@mui/icons-material/Train";
import SchoolIcon from "@mui/icons-material/School";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import DirectionsBusIcon from "@mui/icons-material/DirectionsBus";
import LocationOnIcon from "@mui/icons-material/LocationOn";

// icon mapping
const iconMap = {
  park: LocalFloristIcon,
  hospital: LocalHospitalIcon,
  train_station: TrainIcon,
  school: SchoolIcon,
  supermarket: LocalGroceryStoreIcon,
  bus_stop: DirectionsBusIcon
};

function poiIconFor(type) {
  const key = String(type || "")
    .toLowerCase()
    .trim();
  const IconComponent = iconMap[key] || LocationOnIcon;

  const iconHtml = renderToStaticMarkup(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        background: "#ffffff",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
      }}
    >
      <IconComponent style={{ fontSize: 18 }} />
    </div>
  );

  return L.divIcon({
    className: "",
    html: iconHtml,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
}

const ZONE_GROUPS = {
  residential: ["GRZ", "NRZ", "RGZ", "LDRZ", "TZ", "R1Z", "R2Z", "R3Z"],
  commercialMixed: [
    "ACZ",
    "MUZ",
    "C1Z",
    "C2Z",
    "C3Z",
    "B1Z",
    "B2Z",
    "B3Z",
    "B4Z",
    "B5Z"
  ],
  industrial: ["IN1Z", "IN2Z", "IN3Z"],
  publicSpecial: [
    "PPRZ",
    "PUZ",
    "SUZ",
    "CDZ",
    "DZ",
    "PDZ",
    "RDZ",
    "PCRZ",
    "UFZ"
  ],
  growthRuralEnvironmental: [
    "UGZ",
    "GWZ",
    "RCZ",
    "RCZ1",
    "RCZ2",
    "RCZ3",
    "FZ",
    "FZ1",
    "FZ2",
    "FZ3",
    "PZ",
    "CA",
    "RAZ",
    "NOZ",
    "LSIO",
    "FO"
  ]
};

const ZONING_COLORS = {
  residential: {
    label: "Residential",
    color: "#6A4C93",
    fillColor: "#B8A1D9"
  },
  commercialMixed: {
    label: "Commercial / Mixed Use",
    color: "#E07A1F",
    fillColor: "#F2B880"
  },
  industrial: {
    label: "Industrial",
    color: "#C44536",
    fillColor: "#E89A8F"
  },
  publicSpecial: {
    label: "Public / Special / Development",
    color: "#2A6F97",
    fillColor: "#8EC3DD"
  },
  growthRuralEnvironmental: {
    label: "Growth / Rural / Environmental",
    color: "#4F772D",
    fillColor: "#A7C77B"
  },
  other: {
    label: "Other / Unclassified",
    color: "#5C5C5C",
    fillColor: "#BDBDBD"
  }
};

function getZoneGroup(zoneCode) {
  const code = String(zoneCode || "")
    .toUpperCase()
    .trim();

  if (ZONE_GROUPS.residential.includes(code)) return "residential";
  if (ZONE_GROUPS.commercialMixed.includes(code)) return "commercialMixed";
  if (ZONE_GROUPS.industrial.includes(code)) return "industrial";
  if (ZONE_GROUPS.publicSpecial.includes(code)) return "publicSpecial";
  if (ZONE_GROUPS.growthRuralEnvironmental.includes(code))
    return "growthRuralEnvironmental";

  if (
    code.startsWith("GRZ") ||
    code.startsWith("NRZ") ||
    code.startsWith("RGZ")
  ) {
    return "residential";
  }
  if (
    code.startsWith("C") ||
    code.startsWith("B") ||
    code.startsWith("MUZ") ||
    code.startsWith("ACZ")
  ) {
    return "commercialMixed";
  }
  if (code.startsWith("IN")) return "industrial";
  if (
    code.startsWith("PUZ") ||
    code.startsWith("PPRZ") ||
    code.startsWith("SUZ") ||
    code.startsWith("CDZ") ||
    code.startsWith("PDZ") ||
    code.startsWith("DZ") ||
    code.startsWith("PCRZ") ||
    code.startsWith("UFZ")
  ) {
    return "publicSpecial";
  }
  if (
    code.startsWith("UGZ") ||
    code.startsWith("GWZ") ||
    code.startsWith("RCZ") ||
    code.startsWith("FZ") ||
    code.startsWith("RAZ") ||
    code.startsWith("NOZ")
  ) {
    return "growthRuralEnvironmental";
  }

  return "other";
}

function getZoningStyle(zoneCode) {
  const group = getZoneGroup(zoneCode);
  const palette = ZONING_COLORS[group] || ZONING_COLORS.other;

  return {
    color: palette.color,
    weight: 1.2,
    fillColor: palette.fillColor,
    fillOpacity: 0.45
  };
}

function getZoneGroupLabel(zoneCode) {
  const group = getZoneGroup(zoneCode);
  return (ZONING_COLORS[group] || ZONING_COLORS.other).label;
}

function LegendRow({ color, fillColor, label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 6,
        fontSize: 12,
        color: "#1f2937"
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `2px solid ${color}`,
          background: fillColor,
          display: "inline-block",
          flexShrink: 0
        }}
      />
      <span>{label}</span>
    </div>
  );
}

export default function NeighbourMap({
  coordinates,
  radiusMeters,
  pointsOfInterest,
  suburbPolygon,
  heatLayer,
  vegetationLayer,
  zoningLayer,
  selectedLabel,
  activeLayer
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const circleRef = useRef(null);
  const poiMarkersRef = useRef([]);
  const selectedMarkerRef = useRef(null);
  const polygonLayerRef = useRef(null);
  const heatLayerRef = useRef(null);
  const vegetationLayerRef = useRef(null);
  const zoningLayerRef = useRef(null);

  const coords = useMemo(() => {
    if (!coordinates) return null;
    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng))
      return null;
    return [coordinates.lat, coordinates.lng];
  }, [coordinates]);

  const showZoningLegend =
    zoningLayer &&
    Array.isArray(zoningLayer.features) &&
    zoningLayer.features.length > 0;

  useEffect(() => {
    if (!coords || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      preferCanvas: true
    });
    mapRef.current = map;
    rendererRef.current = L.canvas({ padding: 0.5 });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const selectedIcon = L.divIcon({
      className: "",
      html: `
      <div
        style="
          width: 20px;
          height: 20px;
          background: rgba(170, 59, 255, 0.95);
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        "
    ></div>
  `,
      iconSize: [20, 20],
      iconAnchor: [10, 20]
    });

    selectedMarkerRef.current = L.marker(coords, { icon: selectedIcon }).addTo(
      map
    );

    if (selectedLabel) {
      selectedMarkerRef.current.unbindPopup();
      selectedMarkerRef.current.bindPopup(String(selectedLabel));
    }

    circleRef.current = L.circle(coords, {
      radius: radiusMeters || 2200,
      color: "rgba(170, 59, 255, 0.9)",
      weight: 2,
      fillColor: "rgba(170, 59, 255, 0.18)",
      renderer: rendererRef.current
    }).addTo(map);

    map.setView(coords, 13);
  }, [coords, radiusMeters, selectedLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.setLatLng(coords);
      if (selectedLabel) {
        selectedMarkerRef.current.unbindPopup();
        selectedMarkerRef.current.bindPopup(String(selectedLabel));
      }
    }

    if (circleRef.current) {
      circleRef.current.setLatLng(coords);
    }

    if (
      !suburbPolygon ||
      !Array.isArray(suburbPolygon.features) ||
      suburbPolygon.features.length === 0
    ) {
      map.setView(coords, 13);
    }
  }, [coords, suburbPolygon, selectedLabel]);

  useEffect(() => {
    if (!circleRef.current || !coords) return;
    circleRef.current.setRadius(radiusMeters || 2200);
  }, [radiusMeters, coords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygonLayerRef.current) {
      polygonLayerRef.current.remove();
      polygonLayerRef.current = null;
    }

    if (
      suburbPolygon &&
      Array.isArray(suburbPolygon.features) &&
      suburbPolygon.features.length > 0
    ) {
      polygonLayerRef.current = L.geoJSON(suburbPolygon, {
        renderer: rendererRef.current,
        interactive: false,
        style: {
          color: "rgba(106, 61, 232, 0.95)",
          weight: 3,
          fillColor: "rgba(106, 61, 232, 0.18)",
          fillOpacity: 0.35
        }
      }).addTo(map);

      const bounds = polygonLayerRef.current.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [suburbPolygon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      heatLayerRef.current.remove();
      heatLayerRef.current = null;
    }

    if (
      heatLayer &&
      Array.isArray(heatLayer.features) &&
      heatLayer.features.length > 0
    ) {
      heatLayerRef.current = L.geoJSON(heatLayer, {
        renderer: rendererRef.current,
        interactive: false,
        style: {
          color: "#D73027",
          weight: 1,
          fillColor: "#FC8D59",
          fillOpacity: 0.45
        }
      }).addTo(map);

      heatLayerRef.current.bringToFront();
    }
  }, [heatLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (vegetationLayerRef.current) {
      vegetationLayerRef.current.remove();
      vegetationLayerRef.current = null;
    }

    if (
      vegetationLayer &&
      Array.isArray(vegetationLayer.features) &&
      vegetationLayer.features.length > 0
    ) {
      vegetationLayerRef.current = L.geoJSON(vegetationLayer, {
        renderer: rendererRef.current,
        interactive: false,
        style: {
          color: "#1B7837",
          weight: 1,
          fillColor: "#5AAE61",
          fillOpacity: 0.4
        }
      }).addTo(map);

      vegetationLayerRef.current.bringToFront();
    }
  }, [vegetationLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (zoningLayerRef.current) {
      zoningLayerRef.current.remove();
      zoningLayerRef.current = null;
    }

    if (
      zoningLayer &&
      Array.isArray(zoningLayer.features) &&
      zoningLayer.features.length > 0
    ) {
      zoningLayerRef.current = L.geoJSON(zoningLayer, {
        renderer: rendererRef.current,
        interactive: true,
        style: (feature) => getZoningStyle(feature?.properties?.zone_code),
        onEachFeature: (feature, layer) => {
          const zoneCode = feature?.properties?.zone_code || "Unknown";
          const zoneDesc = feature?.properties?.zone_desc || "Unknown zone";
          const groupLabel = getZoneGroupLabel(zoneCode);

          layer.bindPopup(
            `<strong>${String(zoneCode)}</strong><br/>${String(zoneDesc)}<br/><span style="color:#555;">${String(groupLabel)}</span>`
          );
        }
      }).addTo(map);

      zoningLayerRef.current.bringToFront();
    }
  }, [zoningLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    poiMarkersRef.current.forEach((marker) => marker.remove());
    poiMarkersRef.current = [];

    const hidePois =
      activeLayer === "zoning" ||
      activeLayer === "heat" ||
      activeLayer === "vegetation";

    const list = hidePois
      ? []
      : Array.isArray(pointsOfInterest)
        ? pointsOfInterest
        : [];

    list.forEach((poi) => {
      if (!poi || !Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) {
        return;
      }

      const marker = L.marker([poi.lat, poi.lng], {
        icon: poiIconFor(poi.type)
      }).addTo(map);

      if (poi.name) {
        marker.bindPopup(String(poi.name));
      }

      poiMarkersRef.current.push(marker);
    });
  }, [pointsOfInterest, activeLayer]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }

      mapRef.current = null;
      rendererRef.current = null;
      circleRef.current = null;
      selectedMarkerRef.current = null;
      polygonLayerRef.current = null;
      heatLayerRef.current = null;
      vegetationLayerRef.current = null;
      zoningLayerRef.current = null;
      poiMarkersRef.current = [];
    };
  }, []);

  return (
    <div
      className="nwMapCanvas"
      style={{
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0
        }}
      />

      {showZoningLegend ? (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 28,
            zIndex: 1000,
            background: "rgba(255,255,255,0.96)",
            borderRadius: 12,
            padding: "10px 12px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.16)",
            minWidth: 210,
            border: "1px solid rgba(0,0,0,0.08)"
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, color: "#111827" }}>
            Zoning legend
          </div>

          <LegendRow
            color={ZONING_COLORS.residential.color}
            fillColor={ZONING_COLORS.residential.fillColor}
            label={ZONING_COLORS.residential.label}
          />
          <LegendRow
            color={ZONING_COLORS.commercialMixed.color}
            fillColor={ZONING_COLORS.commercialMixed.fillColor}
            label={ZONING_COLORS.commercialMixed.label}
          />
          <LegendRow
            color={ZONING_COLORS.industrial.color}
            fillColor={ZONING_COLORS.industrial.fillColor}
            label={ZONING_COLORS.industrial.label}
          />
          <LegendRow
            color={ZONING_COLORS.publicSpecial.color}
            fillColor={ZONING_COLORS.publicSpecial.fillColor}
            label={ZONING_COLORS.publicSpecial.label}
          />
          <LegendRow
            color={ZONING_COLORS.growthRuralEnvironmental.color}
            fillColor={ZONING_COLORS.growthRuralEnvironmental.fillColor}
            label={ZONING_COLORS.growthRuralEnvironmental.label}
          />
          <LegendRow
            color={ZONING_COLORS.other.color}
            fillColor={ZONING_COLORS.other.fillColor}
            label={ZONING_COLORS.other.label}
          />
        </div>
      ) : null}
    </div>
  );
}

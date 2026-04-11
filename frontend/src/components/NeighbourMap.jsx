import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { renderToStaticMarkup } from 'react-dom/server'

// MUI Icons
import LocalFloristIcon from '@mui/icons-material/LocalFlorist'
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'
import TrainIcon from '@mui/icons-material/Train'
import SchoolIcon from '@mui/icons-material/School'
import LocalGroceryStoreIcon from '@mui/icons-material/LocalGroceryStore'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'
import LocationOnIcon from '@mui/icons-material/LocationOn'

// icon mapping
const iconMap = {
  park: LocalFloristIcon,
  hospital: LocalHospitalIcon,
  train_station: TrainIcon,
  school: SchoolIcon,
  supermarket: LocalGroceryStoreIcon,
  bus_stop: DirectionsBusIcon,
}

// 🔥 改好的 icon function（重點）
function poiIconFor(type) {
  const key = String(type || '').toLowerCase().trim()
  const IconComponent = iconMap[key] || LocationOnIcon

  const iconHtml = renderToStaticMarkup(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      }}
    >
      <IconComponent style={{ fontSize: 18 }} />
    </div>
  )

  return L.divIcon({
    className: '',
    html: iconHtml,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

export default function NeighbourMap({
  coordinates,
  radiusMeters,
  pointsOfInterest,
  suburbPolygon,
  selectedLabel,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const circleRef = useRef(null)
  const poiMarkersRef = useRef([])
  const selectedMarkerRef = useRef(null)
  const polygonLayerRef = useRef(null)

  const coords = useMemo(() => {
    if (!coordinates) return null
    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null
    return [coordinates.lat, coordinates.lng]
  }, [coordinates])

  // 1) Create map once.
  useEffect(() => {
    if (!coords || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: true })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const selectedIcon = L.divIcon({
      className: '',
      html: '<div class="nwPoiIcon" style="background: rgba(170, 59, 255, 0.9);">NW</div>',
      iconSize: [28, 28],
    })

    selectedMarkerRef.current = L.marker(coords, { icon: selectedIcon }).addTo(map)

    if (selectedLabel) {
      selectedMarkerRef.current.bindPopup(String(selectedLabel))
    }

    circleRef.current = L.circle(coords, {
      radius: radiusMeters || 2200,
      color: 'rgba(170, 59, 255, 0.9)',
      weight: 2,
      fillColor: 'rgba(170, 59, 255, 0.18)',
      fillOpacity: 1,
    }).addTo(map)

    map.setView(coords, 13)
  }, [coords, radiusMeters, selectedLabel])

  // 2) Update selected marker and circle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !coords) return

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.setLatLng(coords)
      if (selectedLabel) {
        selectedMarkerRef.current.bindPopup(String(selectedLabel))
      }
    }

    if (circleRef.current) {
      circleRef.current.setLatLng(coords)
    }

    if (!suburbPolygon || !Array.isArray(suburbPolygon.features) || suburbPolygon.features.length === 0) {
      map.setView(coords, 13)
    }
  }, [coords, suburbPolygon, selectedLabel])

  // 3) Update circle radius
  useEffect(() => {
    if (!circleRef.current || !coords) return
    circleRef.current.setRadius(radiusMeters || 2200)
  }, [radiusMeters, coords])

  // 4) Draw suburb polygon
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (polygonLayerRef.current) {
      polygonLayerRef.current.remove()
      polygonLayerRef.current = null
    }

    if (suburbPolygon && Array.isArray(suburbPolygon.features) && suburbPolygon.features.length > 0) {
      polygonLayerRef.current = L.geoJSON(suburbPolygon, {
        style: {
          color: 'rgba(106, 61, 232, 0.95)',
          weight: 3,
          fillColor: 'rgba(106, 61, 232, 0.18)',
          fillOpacity: 0.35,
        },
      }).addTo(map)

      const bounds = polygonLayerRef.current.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] })
      }
    }
  }, [suburbPolygon])

  // 5) 🔥 POI markers（這裡會用到新 icon）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    poiMarkersRef.current.forEach((marker) => marker.remove())
    poiMarkersRef.current = []

    const list = Array.isArray(pointsOfInterest) ? pointsOfInterest : []

    list.forEach((poi) => {
      if (!poi || !Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) return

      const marker = L.marker([poi.lat, poi.lng], {
        icon: poiIconFor(poi.type), // ✅ 用新 icon
      }).addTo(map)

      if (poi.name) {
        marker.bindPopup(String(poi.name))
      }

      poiMarkersRef.current.push(marker)
    })
  }, [pointsOfInterest])

  // 6) Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
      }

      mapRef.current = null
      circleRef.current = null
      selectedMarkerRef.current = null
      polygonLayerRef.current = null
      poiMarkersRef.current = []
    }
  }, [])

  return <div ref={containerRef} className="nwMapCanvas" />
}
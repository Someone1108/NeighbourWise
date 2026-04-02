import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function poiIconFor(type) {
  const key = String(type || '').toLowerCase()
  if (key === 'school') {
    return L.divIcon({
      className: '',
      html: '<div class="nwPoiIcon nwPoiSchool">Sc</div>',
      iconSize: [28, 28],
    })
  }
  if (key === 'hospital') {
    return L.divIcon({
      className: '',
      html: '<div class="nwPoiIcon nwPoiHospital">Ho</div>',
      iconSize: [28, 28],
    })
  }
  if (key === 'bus stop') {
    return L.divIcon({
      className: '',
      html: '<div class="nwPoiIcon nwPoiBus">Bu</div>',
      iconSize: [28, 28],
    })
  }
  if (key === 'pet-friendly park') {
    return L.divIcon({
      className: '',
      html: '<div class="nwPoiIcon nwPoiPet">Pe</div>',
      iconSize: [28, 28],
    })
  }
  return L.divIcon({
    className: '',
    html: '<div class="nwPoiIcon">POI</div>',
    iconSize: [28, 28],
  })
}

export default function NeighbourMap({ coordinates, radiusMeters, pointsOfInterest }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const circleRef = useRef(null)
  const poiMarkersRef = useRef([])
  const selectedMarkerRef = useRef(null)

  const coords = useMemo(() => {
    if (!coordinates) return null
    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null
    return [coordinates.lat, coordinates.lng]
  }, [coordinates])

  // 1) Create map once, then update view/circle when inputs change.
  useEffect(() => {
    if (!coords) return

    if (!mapRef.current) {
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
      circleRef.current = L.circle(coords, {
        radius: radiusMeters || 2200,
        color: 'rgba(170, 59, 255, 0.9)',
        weight: 2,
        fillColor: 'rgba(170, 59, 255, 0.18)',
        fillOpacity: 1,
      }).addTo(map)

      map.setView(coords, 13)
    } else {
      // Update view + selected marker + highlight circle.
      mapRef.current.setView(coords, 13)
      if (selectedMarkerRef.current) selectedMarkerRef.current.setLatLng(coords)
      if (circleRef.current) circleRef.current.setLatLng(coords)
    }
  }, [coords, radiusMeters])

  useEffect(() => {
    if (!circleRef.current || !coords) return
    circleRef.current.setRadius(radiusMeters || 2200)
  }, [radiusMeters, coords])

  // 2) Update POI markers when POI list changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear previous markers.
    poiMarkersRef.current.forEach((m) => m.remove())
    poiMarkersRef.current = []

    const list = Array.isArray(pointsOfInterest) ? pointsOfInterest : []
    list.forEach((poi) => {
      if (!poi || !Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) return
      const marker = L.marker([poi.lat, poi.lng], { icon: poiIconFor(poi.type) }).addTo(map)
      if (poi.name) marker.bindPopup(String(poi.name))
      poiMarkersRef.current.push(marker)
    })
  }, [pointsOfInterest])

  // 3) Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (mapRef.current) mapRef.current.remove()
      mapRef.current = null
      circleRef.current = null
      selectedMarkerRef.current = null
      poiMarkersRef.current = []
    }
  }, [])

  return <div ref={containerRef} className="nwMapCanvas" />
}


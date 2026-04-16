import { useEffect } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function FitCoverageBounds({ data }) {
  const map = useMap()

  useEffect(() => {
    if (!data?.features?.length) return

    const layer = L.geoJSON(data)
    const bounds = layer.getBounds()

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [data, map])

  return null
}

export default function CoverageMap({ data, loading, error }) {
  const coverageStyle = {
    color: '#8b5cf6',
    weight: 1.2,
    fillColor: '#8b5cf6',
    fillOpacity: 0.03,
  }

  if (loading) {
    return <div className="coverageRealMapState">Loading coverage map...</div>
  }

  if (error) {
    return <div className="coverageRealMapState">{error}</div>
  }

  if (!data?.features?.length) {
    return <div className="coverageRealMapState">No coverage map data available</div>
  }

  return (
    <div className="coverageRealMapWrap">
      <MapContainer
        center={[-37.8136, 144.9631]}
        zoom={10}
        scrollWheelZoom={true}
        className="coverageRealMap"
        preferCanvas={true}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <GeoJSON
          data={data}
          style={coverageStyle}
          interactive={false}
        />

        <FitCoverageBounds data={data} />
      </MapContainer>
    </div>
  )
}
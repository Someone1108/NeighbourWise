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

export default function CoverageMap({ data, loading, error, onRetry }) {
  const coverageStyle = {
    color: '#8b5cf6',
    weight: 1.2,
    fillColor: '#8b5cf6',
    fillOpacity: 0.02,
  }

  if (loading) {
    return (
      <div className="coverageRealMapState">
        <div className="coverageStateCard">
          <div className="coverageStateTitle">Loading coverage map...</div>
          <div className="coverageStateText">
            Please wait while we load Melbourne coverage.
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="coverageRealMapState">
        <div className="coverageStateCard">
          <div className="coverageStateTitle">Coverage map could not load</div>
          <div className="coverageStateText">
            This can happen if the service is taking a little longer than usual to respond.
          </div>

          <div className="coverageStateActions">
            <button 
                type="button" 
                className="coverageRetryBtn" 
                onClick={() => onRetry?.()}
            >
              Retry
            </button>
            <button
              type="button"
              className="coverageRefreshBtn"
              onClick={() => window.location.reload()}
            >
              Refresh page
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data?.features?.length) {
    return (
      <div className="coverageRealMapState">
        <div className="coverageStateCard">
          <div className="coverageStateTitle">No coverage map available</div>
          <div className="coverageStateText">
            We could not find coverage boundary data to display.
          </div>
        </div>
      </div>
    )
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
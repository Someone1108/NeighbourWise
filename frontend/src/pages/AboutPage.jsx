export default function AboutPage() {
  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">About NeighbourWise</h1>
      <p className="nwSubtitle">How we estimate liveability using neighbourhood signals</p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Project description</h2>
        <p style={{ lineHeight: 1.6 }}>
          NeighbourWise helps you explore neighbourhood liveability in Melbourne by turning open
          location signals (amenities and safety indicators) into a simple score.
        </p>

        <h2 style={{ marginTop: 18 }}>Target users</h2>
        <p style={{ lineHeight: 1.6 }}>
          Families, elderly residents, and pet owners who want a quick, data-backed view of how
          different areas might fit their needs.
        </p>

        <h2 style={{ marginTop: 18 }}>Explanation of liveability score</h2>
        <p style={{ lineHeight: 1.6 }}>
          The score is grouped into three categories: Accessibility, Safety, and Environment. Each
          category aggregates multiple factors (for example: nearby stations, supermarket access, or
          green spaces).
        </p>

        <h2 style={{ marginTop: 18 }}>Data sources (open datasets)</h2>
        <p style={{ lineHeight: 1.6 }}>
          In the final system, the backend will combine open data sources (e.g. public transport
          points, service locations, and safety/environment indicators) to determine which factors
          are met.
        </p>

        <h2 style={{ marginTop: 18 }}>How the system works</h2>
        <p style={{ lineHeight: 1.6 }}>
          You search for a suburb/address and choose your situation. The backend then returns the
          liveability results for the selected time range. The front end only displays the returned
          scores and key factors.
        </p>
      </div>
    </div>
  )
}


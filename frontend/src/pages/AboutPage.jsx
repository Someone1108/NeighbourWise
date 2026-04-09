export default function AboutPage() {
  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">About NeighbourWise</h1>
      <p className="nwSubtitle">How we estimate liveability using neighbourhood signals</p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Project description</h2>
        <p style={{ lineHeight: 1.7 }}>
          NeighbourWise helps you explore neighbourhood liveability in Melbourne by turning open
          location signals such as amenities, accessibility, and safety indicators into a simple,
          easy-to-understand score.
        </p>

        <h2 style={{ marginTop: 22 }}>Target users</h2>
        <p style={{ lineHeight: 1.7 }}>
          Families, elderly residents, and pet owners who want a quick, data-backed view of how
          different areas might fit their needs.
        </p>

        <h2 style={{ marginTop: 22 }}>Explanation of liveability score</h2>
        <p style={{ lineHeight: 1.7 }}>
          The score is grouped into three categories: Accessibility, Safety, and Environment. Each
          category combines multiple factors such as nearby stations, supermarket access, safety
          context, and green spaces.
        </p>

        <h2 style={{ marginTop: 22 }}>Data sources (open datasets)</h2>
        <p style={{ lineHeight: 1.7 }}>
          In the final system, the backend will combine open data sources such as public transport
          points, service locations, and safety or environment indicators to determine which factors
          are met.
        </p>

        <h2 style={{ marginTop: 22 }}>How the system works</h2>
        <p style={{ lineHeight: 1.7 }}>
          You search for a suburb or address and choose your situation. The backend then returns the
          liveability results for the selected time range, while the front end displays the returned
          scores, map view, and key factors in a clear way.
        </p>
      </div>
    </div>
  )
}
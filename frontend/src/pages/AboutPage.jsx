export default function AboutPage() {
  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">About NeighbourWise</h1>
      <p className="nwSubtitle">
        Helping you compare Melbourne suburbs for daily convenience and lifestyle fit
      </p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>What NeighbourWise does</h2>
        <p style={{ lineHeight: 1.7 }}>
          NeighbourWise helps you explore suburb liveability in Melbourne using map-based insights.
          It turns neighbourhood signals into clear scores so you can quickly compare areas.
        </p>

        <h2 style={{ marginTop: 22 }}>Who it is for</h2>
        <p style={{ lineHeight: 1.7 }}>
          House-hunters, families with children, older residents, and pet owners who want a practical
          view of travel convenience and neighbourhood suitability.
        </p>

        <h2 style={{ marginTop: 22 }}>How scoring is shown</h2>
        <p style={{ lineHeight: 1.7 }}>
          Liveability is presented through three categories: Accessibility, Safety, and Environment.
          You can view the overall score and a category-by-category breakdown.
        </p>

        <h2 style={{ marginTop: 22 }}>What you can do</h2>
        <p style={{ lineHeight: 1.7 }}>
          Search a suburb or address, choose your profile, check map-based score results, review key
          factors, and compare shortlisted areas side by side.
        </p>

        <h2 style={{ marginTop: 22 }}>Data and transparency</h2>
        <p style={{ lineHeight: 1.7 }}>
          NeighbourWise is designed to use open data signals so users can understand how accessibility
          and neighbourhood context may affect everyday living.
        </p>
      </div>
    </div>
  )
}
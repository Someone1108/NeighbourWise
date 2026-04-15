export default function AboutPage() {
  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">About NeighbourWise</h1>
      <p className="nwSubtitle">
        NeighbourWise helps you compare Melbourne suburbs for daily convenience and lifestyle fit.
      </p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <p style={{ lineHeight: 1.7 }}>
          It presents liveability through three simple categories: Accessibility, Safety, and
          Environment.
        </p>

        <p style={{ lineHeight: 1.7 }}>
          You can search an area, view map-based results, and compare shortlisted suburbs side by side.
        </p>
      </div>
    </div>
  )
}
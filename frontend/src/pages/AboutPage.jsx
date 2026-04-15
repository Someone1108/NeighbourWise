export default function AboutPage() {
  return (
    <div className="nwPage nwAboutPage">
      <h1 className="nwPageTitle">About NeighbourWise</h1>
      <p className="nwSubtitle nwAboutSubtitle">
        Helping people make better neighbourhood decisions
      </p>

      <div className="nwAboutGrid">
        <section className="nwCard nwAboutCard">
          <h2 className="nwAboutSectionTitle">About the platform</h2>
          <p className="nwAboutLead">
            We built this platform to help people explore and understand neighbourhood liveability in
            Melbourne.
          </p>

          <p className="nwAboutParagraph">
            Many existing property websites focus mainly on prices and listings, but do not provide
            enough information about what it is actually like to live in a neighbourhood. This can make
            it difficult for people, especially newcomers, to choose the right place to live.
          </p>

          <p className="nwAboutParagraph">
            Our platform brings together different types of data to provide a liveability score and
            visual insights, helping users better understand each area.
          </p>
        </section>

        <section className="nwCard nwAboutCard">
          <h2 className="nwAboutSectionTitle">About the team</h2>
          <p className="nwAboutParagraph nwAboutFootnote">
            We are a team of students from Monash University, working on a smart city project to improve
            urban living decisions through data.
          </p>
        </section>
      </div>
    </div>
  )
}
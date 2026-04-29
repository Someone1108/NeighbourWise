const SCORE_CATEGORIES = [
  {
    icon: '🚌',
    title: 'Accessibility',
    desc: 'How easy is it to get around? This looks at proximity to public transport, supermarkets, schools, and everyday services within your chosen travel time.',
    accent: 'rgba(8, 145, 178, 0.12)',
    accentBorder: 'rgba(8, 145, 178, 0.32)',
  },
  {
    icon: '🛡',
    title: 'Safety',
    desc: 'An indication of how safe an area feels, based on publicly available local indicators. Higher is better.',
    accent: 'rgba(244, 124, 32, 0.12)',
    accentBorder: 'rgba(244, 124, 32, 0.32)',
  },
  {
    icon: '🌿',
    title: 'Environment',
    desc: 'Green space coverage, urban heat, and overall environmental quality of the neighbourhood.',
    accent: 'rgba(42, 157, 143, 0.12)',
    accentBorder: 'rgba(42, 157, 143, 0.32)',
  },
]

export default function AboutPage() {
  return (
    <div className="nwPage nwAboutPage">
      {/* ── HERO ── */}
      <section className="nwAboutHero">
        <span className="nwAboutEyebrow">About NeighbourWise</span>
        <h1 className="nwAboutTitle">
          Find a Melbourne neighbourhood that fits <em>your life.</em>
        </h1>
        <p className="nwAboutLead">
          NeighbourWise helps you find a Melbourne neighbourhood that fits your life — with scores,
          maps, and side-by-side comparisons based on real location data.
        </p>
      </section>

      {/* ── ABOUT THE PLATFORM ── (color block) */}
      <section className="nwAboutBlock nwAboutBlock--teal">
        <div className="nwAboutBlockInner">
          <p className="nwAboutBlockEyebrow">The platform</p>
          <h2 className="nwAboutBlockHeading">
            We built this platform to help people explore and understand neighbourhood liveability in Melbourne.
          </h2>
          <div className="nwAboutBlockGrid">
            <p>
              Many existing property websites focus mainly on prices and listings, but do not provide enough
              information about what it is actually like to live in a neighbourhood. This can make it difficult
              for people, especially newcomers, to choose the right place to live.
            </p>
            <p>
              Our platform brings together different types of data to provide a liveability score and visual
              insights, helping users better understand each area.
            </p>
          </div>
        </div>
      </section>

      {/* ── SCORE CATEGORIES ── */}
      <section className="nwAboutSection">
        <div className="nwAboutSectionHead">
          <p className="nwAboutSectionEyebrow">Understanding your score</p>
          <h2 className="nwAboutSectionTitle">
            Every suburb gets an overall score out of 100, broken into three categories.
          </h2>
          <p className="nwAboutSectionLead">
            Each score is calculated from the places and services reachable within your chosen travel time.
          </p>
        </div>

        <div className="nwAboutCategoryGrid">
          {SCORE_CATEGORIES.map(({ icon, title, desc, accent, accentBorder }) => (
            <div
              key={title}
              className="nwAboutCategoryCard"
              style={{ background: accent, borderColor: accentBorder }}
            >
              <div className="nwAboutCategoryIcon" aria-hidden="true">{icon}</div>
              <div className="nwAboutCategoryTitle">{title}</div>
              <p className="nwAboutCategoryDesc">{desc}</p>
            </div>
          ))}
        </div>

        <p className="nwAboutFootnote">
          A higher score means a better result for that category. Use these scores as a starting
          point — they are a guide, not a definitive verdict.
        </p>
      </section>

      {/* ── WHO IT'S FOR ── */}
      <section className="nwAboutBlock nwAboutBlock--orange">
        <div className="nwAboutBlockInner">
          <p className="nwAboutBlockEyebrow">Who is it for?</p>
          <h2 className="nwAboutBlockHeading">
            People making real decisions about where to live in Melbourne.
          </h2>
          <p className="nwAboutBlockBody">
            Whether you are a family looking for good schools and parks, an older resident who needs
            healthcare and quiet streets, or a pet owner hunting for dog-friendly open spaces —
            choose your profile and the scores will reflect what matters most to you.
          </p>
        </div>
      </section>

      {/* ── ABOUT THE TEAM ── */}
      <section className="nwAboutSection nwAboutTeam">
        <div className="nwAboutSectionHead">
          <p className="nwAboutSectionEyebrow">The team</p>
          <h2 className="nwAboutSectionTitle">Built by Monash University students.</h2>
          <p className="nwAboutSectionLead">
            We are a team of students from Monash University, working on a smart city project to improve
            urban living decisions through data.
          </p>
        </div>
      </section>
    </div>
  )
}

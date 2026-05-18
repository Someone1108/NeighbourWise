import { useEffect, useState } from 'react'
import { getCoverageSuburbs } from '../services/api.js'

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
    title: 'Safety & Comfort',
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

const METHODOLOGY_ROWS = [
  {
    key: 'accessibility',
    label: 'Accessibility',
    icon: '🚇',
    color: '#2563eb',
    soft: '#eff6ff',
    border: '#bfdbfe',
    weightText: '40% default weight',
    sourceText: 'GTFS transport feeds + OpenStreetMap places',
    factors: [
      'Bus stops',
      'Train stations',
      'Supermarkets',
      'Hospitals',
      'Schools',
      'Parks',
      'Dog parks for pet profiles',
      'Nearest distance and nearby count within the selected travel range',
    ],
  },
  {
    key: 'safety',
    label: 'Safety & Comfort',
    icon: '🛡️',
    color: '#059669',
    soft: '#ecfdf5',
    border: '#a7f3d0',
    weightText: '35% default weight',
    sourceText: 'Crime Statistics VIC, OpenStreetMap safety tags + VicPlan zoning',
    factors: [
      'Recorded-crime context',
      'Activity and passive-safety places',
      'Noise and traffic comfort',
      'Street lighting signals',
      'Public transport stop comfort',
      'Shelter, benches, covered stops, wheelchair access and tactile paving',
      'Nearby zoning mix',
    ],
  },
  {
    key: 'environment',
    label: 'Environment',
    icon: '🌿',
    color: '#ea580c',
    soft: '#fff7ed',
    border: '#fed7aa',
    weightText: '25% default weight',
    sourceText: 'Vegetation cover, urban heat, VicPlan zoning + EPA AirWatch',
    factors: [
      'Vegetation cover',
      'Urban heat island exposure',
      'Environmental zoning comfort',
      'EPA air quality readings',
      'Nearby green-area coverage within the selected travel range',
    ],
  },
]

export default function AboutPage() {
  const [suburbCount, setSuburbCount] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCoverageSuburbs()
      .then(data => {
        if (cancelled) return
        const count = Array.isArray(data?.suburbs) ? data.suburbs.length : null
        setSuburbCount(count)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const suburbLabel = suburbCount !== null ? `${suburbCount} suburbs` : '127+ suburbs'

  return (
    <div className="nwPage nwAboutPage">
      {/* ── BANNER ── */}
      <section className="nwAboutBanner">
        <div className="nwAboutBannerGlow" aria-hidden="true" />
        <div className="nwAboutBannerInner">
          <h1 className="nwAboutBannerTitle">
            About <em>NeighbourWise</em>
          </h1>

          <p className="nwAboutBannerLead">
            NeighbourWise helps you find a Melbourne neighbourhood that fits your life, with
            composite liveability scores, interactive maps, and side-by-side suburb comparisons
            built on real open data.
          </p>

          <ul className="nwAboutBannerStats" aria-label="At a glance">
            <li className="nwAboutBannerStat">{suburbLabel}</li>
            <li className="nwAboutBannerStat">3 scoring categories</li>
            <li className="nwAboutBannerStat">15 open data sources</li>
            <li className="nwAboutBannerStat">Personalised profiles</li>
          </ul>
        </div>
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
          point: they are a guide, not a definitive verdict.
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
            healthcare and quiet streets, or a pet owner hunting for dog-friendly open spaces:
            choose your profile and the scores will reflect what matters most to you.
          </p>
        </div>
      </section>

      {/* ── METHODOLOGY ── */}
      <section className="nwAboutSection" style={{ paddingTop: 0 }}>
        <div style={{
          background: '#fff', border: '1.5px solid #e5e7eb',
          borderRadius: 20, padding: '28px 32px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4b5563', marginBottom: 6 }}>
            Methodology
          </p>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: '#1a2436', marginBottom: 20 }}>
            How this score is calculated
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 18 }}>
            The overall score combines these three category scores. Default weights are shown below;
            profile choices can shift the balance toward family, elderly, or pet-owner priorities.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {METHODOLOGY_ROWS.map(({ key, label, icon, color, soft, border, weightText, sourceText, factors }) => (
              <article
                key={key}
                style={{
                  border: `1.5px solid ${border}`,
                  borderRadius: 16,
                  background: soft,
                  padding: '18px 18px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1a2436', margin: 0 }}>
                      {label}
                    </h3>
                    <p style={{ fontSize: 12, fontWeight: 800, color, marginTop: 4 }}>
                      {weightText}
                    </p>
                  </div>
                </div>

                <p style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 10 }}>
                  {sourceText}
                </p>

                <ul style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  {factors.map((factor) => (
                    <li
                      key={factor}
                      style={{
                        background: '#fff',
                        border: '1px solid rgba(148,163,184,0.35)',
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#475569',
                        lineHeight: 1.2,
                      }}
                    >
                      {factor}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}

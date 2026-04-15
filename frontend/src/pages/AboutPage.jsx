const SCORE_CATEGORIES = [
  {
    icon: '🚌',
    title: 'Accessibility',
    desc: 'How easy is it to get around? This looks at proximity to public transport, supermarkets, schools, and everyday services within your chosen travel time.',
  },
  {
    icon: '🛡',
    title: 'Safety',
    desc: 'An indication of how safe an area feels, based on publicly available local indicators. Higher is better.',
  },
  {
    icon: '🌿',
    title: 'Environment',
    desc: 'Green space coverage, urban heat, and overall environmental quality of the neighbourhood.',
  },
]

const HOW_TO_STEPS = [
  { step: '1', label: 'Search', desc: 'Type a suburb name or street address in Melbourne.' },
  { step: '2', label: 'Choose your profile', desc: 'Tell us your situation — family, elderly, or pet owner — so scores reflect what matters to you.' },
  { step: '3', label: 'Explore', desc: 'See the liveability map, detailed scores, and nearby places of interest.' },
  { step: '4', label: 'Compare', desc: 'Add areas to your compare list to weigh up two suburbs side by side.' },
]

export default function AboutPage() {
  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">About NeighbourWise</h1>
      <p className="nwSubtitle">
        NeighbourWise helps you find a Melbourne neighbourhood that fits your life — with scores,
        maps, and side-by-side comparisons based on real location data.
      </p>

      {/* ── HOW IT WORKS ── */}
      <div className="nwCard" style={{ textAlign: 'left', marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, marginBottom: 18 }}>How to use NeighbourWise</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {HOW_TO_STEPS.map(({ step, label, desc }) => (
            <div
              key={step}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '16px', borderRadius: 16,
                border: '1px solid var(--border-light)', background: 'white',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--teal-bg)', border: '1px solid rgba(42,157,143,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 14, color: 'var(--accent-2)',
              }}>
                {step}
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-dark)' }}>{label}</div>
              <div style={{ fontSize: 14, color: 'var(--muted-dark)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SCORE CATEGORIES ── */}
      <div className="nwCard" style={{ textAlign: 'left', marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Understanding your score</h2>
        <p style={{ color: 'var(--muted-dark)', lineHeight: 1.6, marginBottom: 18, fontSize: 15 }}>
          Every suburb gets an overall score out of 100, broken into three categories. Each score
          is calculated from the places and services reachable within your chosen travel time.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SCORE_CATEGORIES.map(({ icon, title, desc }) => (
            <div
              key={title}
              style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                padding: '14px 16px', borderRadius: 16,
                border: '1px solid var(--border-light)', background: 'white',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'var(--teal-bg)', border: '1px solid rgba(42,157,143,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                {icon}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-dark)', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 14, color: 'var(--muted-dark)', lineHeight: 1.6 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 18, fontSize: 14, color: 'var(--muted-dark)', lineHeight: 1.6 }}>
          A higher score means a better result for that category. Use these scores as a starting
          point — they are a guide, not a definitive verdict.
        </p>
      </div>

      {/* ── WHO IT'S FOR ── */}
      <div className="nwCard" style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>Who is it for?</h2>
        <p style={{ color: 'var(--muted-dark)', lineHeight: 1.7, fontSize: 15 }}>
          NeighbourWise is built for people making real decisions about where to live in Melbourne.
          Whether you are a family looking for good schools and parks, an older resident who needs
          healthcare and quiet streets, or a pet owner hunting for dog-friendly open spaces —
          choose your profile and the scores will reflect what matters most to you.
        </p>
      </div>
    </div>
  )
}
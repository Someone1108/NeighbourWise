const CATEGORY_LABELS = {
  accessibility: 'Accessibility',
  safety: 'Safety',
  environment: 'Environment',
}

export default function ScoreBar({ category, score, outOf = 100 }) {
  const safeScore = Number.isFinite(score) ? score : 0
  const safeOut = Number.isFinite(outOf) && outOf > 0 ? outOf : 100
  const percent = Math.max(0, Math.min(100, (safeScore / safeOut) * 100))
  const label = CATEGORY_LABELS[category] || category

  return (
    <section className="nwScoreBar" aria-label={`${category} score`}>
      <div className="nwScoreBarTop">
        <div className="nwScoreBarLabel">{label}</div>
        <div className="nwScoreBarValue">
          {safeScore} / {safeOut}
        </div>
      </div>
      <div className="nwProgressOuter" role="progressbar" aria-valuenow={safeScore} aria-valuemax={safeOut}>
        <div className="nwProgressInner" style={{ width: `${percent}%` }} />
      </div>
    </section>
  )
}


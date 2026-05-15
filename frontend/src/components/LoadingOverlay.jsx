/**
 * Full-area loading overlay with a centred spinner and a label.
 * Place inside a position:relative parent. Pass `fixed` for a viewport-wide
 * variant (sits below the navbar). The overlay also blocks pointer events
 * so users can't click controls behind it while data is loading.
 */
export default function LoadingOverlay({
  label = 'Loading…',
  fixed = false,
  show = true,
}) {
  if (!show) return null
  const className = `nwLoadingOverlay${fixed ? ' nwLoadingOverlay--fixed' : ''}`
  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="nwSpinner" aria-hidden="true" />
      <div className="nwLoadingOverlay__text">{label}</div>
    </div>
  )
}

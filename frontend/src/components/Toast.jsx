import { useEffect, useRef } from 'react'

/**
 * Small auto-dismissing pop-up notification.
 * - Pass `message` (truthy) to show; falsy to hide.
 * - `duration` ms before auto-dismiss (default 2500). Pass 0 to disable auto-dismiss.
 * - `onClose` is called when the toast hides (either auto or via close button).
 * - `action` is an optional { label, onClick } object for a CTA button inside the toast.
 *   When an action is present, auto-dismiss is disabled (duration is ignored) so the
 *   user has time to act on it — they must close manually or click the action.
 */
export default function Toast({ message, duration = 2500, onClose, action }) {
  const timerRef = useRef(null)
  const hasAction = Boolean(action?.label && action?.onClick)

  useEffect(() => {
    if (!message) return undefined
    // Don't auto-dismiss when there's an action button — give the user time to click
    if (hasAction || duration <= 0) return undefined

    timerRef.current = window.setTimeout(() => {
      if (typeof onClose === 'function') onClose()
    }, duration)

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [message, duration, onClose, hasAction])

  function dismiss() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (typeof onClose === 'function') onClose()
  }

  return (
    <div
      className={`nwToast${message ? ' is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="nwToast__msg">{message || ''}</span>

      {message && (
        <div className="nwToast__actions">
          {hasAction && (
            <button
              type="button"
              className="nwToast__action"
              onClick={() => {
                action.onClick()
                dismiss()
              }}
            >
              {action.label}
            </button>
          )}
          <button
            type="button"
            className="nwToast__close"
            aria-label="Dismiss notification"
            onClick={dismiss}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

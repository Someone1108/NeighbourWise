import { useEffect, useRef } from 'react'

/**
 * Small auto-dismissing pop-up notification.
 * - Pass `message` (truthy) to show; falsy to hide.
 * - `duration` ms before auto-dismiss (default 2200). Pass 0 to disable.
 * - `onClose` is called when the toast hides (either auto or via close button).
 *
 * The toast sits near the top of the page so it's clearly visible without
 * scrolling, and uses role="status" so screen readers announce it politely.
 */
export default function Toast({ message, duration = 2200, onClose }) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (!message) return undefined
    if (duration > 0) {
      timerRef.current = window.setTimeout(() => {
        if (typeof onClose === 'function') onClose()
      }, duration)
    }
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [message, duration, onClose])

  return (
    <div
      className={`nwToast${message ? ' is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{message || ''}</span>
      {message ? (
        <button
          type="button"
          className="nwToast__close"
          aria-label="Dismiss notification"
          onClick={() => {
            if (timerRef.current) {
              window.clearTimeout(timerRef.current)
              timerRef.current = null
            }
            if (typeof onClose === 'function') onClose()
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

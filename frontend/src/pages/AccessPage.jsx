import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import heroImage from '../assets/BG1.jpg'

const DEMO_PASSWORD = 'iteration1_te07'

export default function AccessPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()

    if (password === DEMO_PASSWORD) {
      sessionStorage.setItem('nw_access_granted', 'true')
      navigate('/')
      return
    }

    setError('Incorrect password. Please try again.')
  }

  return (
    <div
      className="nwAccessPage"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      <div className="nwAccessOverlay" aria-hidden="true" />

      <div className="nwAccessCard" role="dialog" aria-labelledby="access-title">
        <span className="nwAccessEyebrow">Melbourne · Liveability Explorer</span>

        <h1 id="access-title" className="nwAccessTitle">
          NeighbourWise
        </h1>

        <p className="nwAccessSubtitle">
          Enter your access code to continue.
        </p>

        <form onSubmit={handleSubmit} className="nwAccessForm">
          <label htmlFor="nw-access-pw" className="nwAccessLabel">
            Access code
          </label>
          <input
            id="nw-access-pw"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="Enter your access code"
            className="nwAccessInput"
            autoFocus
            autoComplete="current-password"
          />

          <div
            className="nwAccessError"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            {error}
          </div>

          <button type="submit" className="nwAccessButton">
            Enter Site
            <span className="nwAccessButtonArrow" aria-hidden="true">→</span>
          </button>
        </form>
      </div>
    </div>
  )
}

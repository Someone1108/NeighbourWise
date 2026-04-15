import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #dfe5ec 0%, #cfd6df 100%)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#ffffff',
          borderRadius: '28px',
          padding: '36px 32px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.12)',
          border: '1px solid #e5eaf1',
        }}
      >
        <div style={{ marginBottom: '22px' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '2.2rem',
              lineHeight: 1.1,
              fontWeight: 900,
              color: '#0f172a',
            }}
          >
            NeighbourWise Access
          </h1>

          <p
            style={{
              margin: '12px 0 0 0',
              fontSize: '1.05rem',
              color: '#64748b',
            }}
          >
            Enter the password to continue to Iteration 1.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="Enter password"
            style={{
              width: '100%',
              padding: '16px 18px',
              fontSize: '1rem',
              borderRadius: '18px',
              border: '1px solid #d7dee8',
              outline: 'none',
              boxSizing: 'border-box',
              color: '#0f172a',
              background: '#fbfcfe',
            }}
          />

          {error ? (
            <div
              style={{
                marginTop: '12px',
                color: '#dc2626',
                fontSize: '0.95rem',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            style={{
              marginTop: '18px',
              width: '100%',
              border: 'none',
              borderRadius: '18px',
              padding: '14px 18px',
              fontSize: '1rem',
              fontWeight: 800,
              color: '#ffffff',
              background: '#f47c20',
              cursor: 'pointer',
              boxShadow: '0 10px 24px rgba(244, 124, 32, 0.22)',
            }}
          >
            Enter Site
          </button>
        </form>
      </div>
    </div>
  )
}
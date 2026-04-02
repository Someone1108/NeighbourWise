import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/buttons/Button.jsx'
import { validateSearchInput, } from '../services/api.js'
import { saveContext } from '../utils/storage.js'

export default function HomePage() {
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')

  const [profile, setProfile] = useState({
    familyWithChildren: false,
    elderly: false,
    petOwner: false,
  })

  const selectedProfileCount = useMemo(() => {
    return Object.values(profile).filter(Boolean).length
  }, [profile])

  function onSubmit() {
    const v = validateSearchInput(address)
    if (!v.ok) {
      setError(v.message)
      return
    }
    setError('')

    const ctx = {
      locationName: String(address).trim(),
      profile,
    }
    saveContext(ctx)
    navigate('/map', { state: ctx })
  }

  return (
    <div className="nwPage">
      <h1 className="nwPageTitle">Find the right place to live</h1>
      <p className="nwSubtitle">Based on real neighbourhood data</p>

      <div className="nwCard" style={{ textAlign: 'left' }}>
        <div className="nwFormRow">
          <label style={{ fontWeight: 800 }}>Search</label>
          <input
            className="nwInput"
            placeholder="Enter suburb or address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-label="Search suburb or address"
          />
        </div>

        <div className="nwFormRow" style={{ marginTop: 6 }}>
          <label style={{ fontWeight: 800 }}>Your situation</label>
          <div className="nwCheckGroup">
            <label className="nwCheckbox">
              <input
                type="checkbox"
                checked={profile.familyWithChildren}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, familyWithChildren: e.target.checked }))
                }
              />
              Family with children
            </label>
            <label className="nwCheckbox">
              <input
                type="checkbox"
                checked={profile.elderly}
                onChange={(e) => setProfile((p) => ({ ...p, elderly: e.target.checked }))}
              />
              Elderly
            </label>
            <label className="nwCheckbox">
              <input
                type="checkbox"
                checked={profile.petOwner}
                onChange={(e) => setProfile((p) => ({ ...p, petOwner: e.target.checked }))}
              />
              Pet owner
            </label>
          </div>
        </div>

        {error ? <div className="nwError">{error}</div> : null}

        <div className="nwBtnRow">
          <Button variant="primary" onClick={onSubmit}>
            Check Liveability
          </Button>
        </div>

        <div style={{ marginTop: 14, color: 'var(--text)', textAlign: 'left' }}>
          Your data is protected
          {selectedProfileCount ? (
            <span style={{ display: 'block', marginTop: 8 }}>
              Selected options: {selectedProfileCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}


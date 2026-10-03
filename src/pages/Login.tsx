import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import ContactLink from '../components/ContactLink.tsx'
import { nextPath } from '../components/RequireLogin.tsx'
import { config } from '../config.ts'

export default function Login() {
  const { profile, signIn } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const { search } = useLocation()

  if (profile) return <Navigate to={nextPath(search)} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(await signIn(phone, password))
    setBusy(false)
  }

  return (
    <section className="auth-page">
      <h1>Log in</h1>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Phone number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>

        <button type="button" className="link-button" onClick={() => setShowForgot((v) => !v)}>
          Forgot your password?
        </button>
        {showForgot && (
          <div className="note">
            <p>{config.messages.forgotPassword}</p>
            <ContactLink />
          </div>
        )}
      </form>

      <p className="auth-switch">
        New to {config.siteName}? <Link to="/signup">Create an account</Link>
      </p>
    </section>
  )
}

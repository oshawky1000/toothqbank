import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PASSWORD_MIN_LENGTH, useAuth } from '../auth/AuthContext.tsx'
import { config } from '../config.ts'

export default function Signup() {
  const { profile, signUp } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (profile) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(await signUp(fullName, phone, password))
    setBusy(false)
  }

  return (
    <section className="auth-page">
      <h1>Create an account</h1>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Full name</span>
          <input
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </label>

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
          <span className="field-hint">
            Egyptian mobile like 01012345678, or an international number starting with + and the
            country code. You will log in with this number.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <span className="field-hint">At least {PASSWORD_MIN_LENGTH} characters.</span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
      <p className="field-hint">
        New accounts are checked by a {config.siteName} admin before courses can be opened.
      </p>
    </section>
  )
}

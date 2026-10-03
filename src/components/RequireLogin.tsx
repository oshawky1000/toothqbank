import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'

// Pages that need an account send logged-out visitors to Log in, then back here.
export default function RequireLogin({ children }: { children: ReactNode }) {
  const { loading, profile, loadError } = useAuth()
  const location = useLocation()

  if (loading) return <p className="muted">Loading…</p>
  if (!profile) {
    // Logged in but the account did not load (no internet): the banner above offers "Try again".
    if (loadError) return null
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}

/** Where to go after logging in: the ?next= page, if it is a page on this site. */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

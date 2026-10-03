import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import logoMark from '../assets/logo-mark.png'
import { useAuth } from '../auth/AuthContext.tsx'
import { config } from '../config.ts'
import ErrorBoundary from './ErrorBoundary.tsx'
import StatusBanner from './StatusBanner.tsx'

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

export default function Layout() {
  const { loading, profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const online = useOnline()

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <img src={logoMark} alt="" className="brand-mark" width="32" height="32" />
            <span className="brand-name">{config.siteName}</span>
          </Link>

          <nav className="topbar-actions">
            {loading ? null : profile ? (
              <>
                {profile.is_admin ? (
                  <Link to="/admin" className="topbar-link">
                    Admin
                  </Link>
                ) : (
                  <span className="topbar-user">{profile.full_name}</span>
                )}
                <button type="button" className="button button-small button-secondary" onClick={signOut}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="topbar-link">
                  Log in
                </Link>
                <Link to="/signup" className="button button-small">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container main">
        {!online && (
          <div className="banner banner-warning" role="status">
            <p>You are offline. Answers cannot be saved until your internet connection is back.</p>
          </div>
        )}
        <StatusBanner />
        {/* A new page starts without the previous page's error. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} {config.siteName}</div>
      </footer>
    </div>
  )
}

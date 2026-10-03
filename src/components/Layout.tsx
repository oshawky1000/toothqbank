import { Link, Outlet } from 'react-router-dom'
import logoMark from '../assets/logo-mark.png'
import { useAuth } from '../auth/AuthContext.tsx'
import { config } from '../config.ts'
import StatusBanner from './StatusBanner.tsx'

export default function Layout() {
  const { loading, profile, signOut } = useAuth()

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
        <StatusBanner />
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} {config.siteName}</div>
      </footer>
    </div>
  )
}

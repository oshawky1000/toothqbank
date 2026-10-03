import { Link, Outlet } from 'react-router-dom'
import logoMark from '../assets/logo-mark.png'
import { config } from '../config.ts'

export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <img src={logoMark} alt="" className="brand-mark" width="32" height="32" />
            <span className="brand-name">{config.siteName}</span>
          </Link>
        </div>
      </header>

      <main className="container main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} {config.siteName}</div>
      </footer>
    </div>
  )
}

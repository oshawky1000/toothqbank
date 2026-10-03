import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.tsx'

// Wraps every /admin page. The database refuses admin actions from non-admins
// anyway; this only stops students from seeing an empty dashboard.
export default function AdminLayout() {
  const { loading, profile } = useAuth()

  if (loading) return <p className="muted">Loading…</p>
  if (!profile?.is_admin) {
    return (
      <section>
        <h1>Admins only</h1>
        <p className="lead">This page is only for ToothQBank admins.</p>
      </section>
    )
  }

  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'admin-tab active' : 'admin-tab')

  return (
    <section className="admin">
      <h1>Admin</h1>
      <nav className="admin-tabs">
        <NavLink to="/admin" end className={tab}>
          Students
        </NavLink>
        <NavLink to="/admin/reports" className={tab}>
          Reports
        </NavLink>
        <NavLink to="/admin/import" className={tab}>
          Import
        </NavLink>
        <NavLink to="/admin/stats" className={tab}>
          Stats
        </NavLink>
      </nav>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Outlet />
      </Suspense>
    </section>
  )
}

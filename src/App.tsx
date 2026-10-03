import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import Chapter from './pages/Chapter.tsx'
import Course from './pages/Course.tsx'
import Home from './pages/Home.tsx'
import Login from './pages/Login.tsx'
import NotFound from './pages/NotFound.tsx'
import Signup from './pages/Signup.tsx'

// Admin pages load only when an admin opens them, so students download less.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.tsx'))
const Students = lazy(() => import('./pages/admin/Students.tsx'))
const Reports = lazy(() => import('./pages/admin/Reports.tsx'))
const Import = lazy(() => import('./pages/admin/Import.tsx'))
const Stats = lazy(() => import('./pages/admin/Stats.tsx'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="course/:courseId" element={<Course />} />
        <Route path="course/:courseId/chapter/:chapterId" element={<Chapter />} />
        <Route
          path="admin"
          element={
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <AdminLayout />
            </Suspense>
          }
        >
          <Route index element={<Students />} />
          <Route path="reports" element={<Reports />} />
          <Route path="import" element={<Import />} />
          <Route path="stats" element={<Stats />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

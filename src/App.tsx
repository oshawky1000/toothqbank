import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import RequireLogin from './components/RequireLogin.tsx'
import Chapter from './pages/Chapter.tsx'
import Course from './pages/Course.tsx'
import Home from './pages/Home.tsx'
import Login from './pages/Login.tsx'
import NotFound from './pages/NotFound.tsx'
import Signup from './pages/Signup.tsx'

// These pages load only when opened, so the first visit downloads less.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.tsx'))
const Students = lazy(() => import('./pages/admin/Students.tsx'))
const Reports = lazy(() => import('./pages/admin/Reports.tsx'))
const Import = lazy(() => import('./pages/admin/Import.tsx'))
const Stats = lazy(() => import('./pages/admin/Stats.tsx'))
const Practice = lazy(() => import('./pages/Practice.tsx'))
const Session = lazy(() => import('./pages/Session.tsx'))
const SecurityCheck = lazy(() => import('./pages/SecurityCheck.tsx'))

const loading = <p className="muted">Loading…</p>

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="course/:courseId" element={<Course />} />
        <Route path="course/:courseId/chapter/:chapterId" element={<Chapter />} />
        <Route
          path="course/:courseId/practice"
          element={
            <RequireLogin>
              <Suspense fallback={loading}>
                <Practice />
              </Suspense>
            </RequireLogin>
          }
        />
        <Route
          path="session/:sessionId"
          element={
            <RequireLogin>
              <Suspense fallback={loading}>
                <Session />
              </Suspense>
            </RequireLogin>
          }
        />
        <Route
          path="admin"
          element={
            <RequireLogin>
              <Suspense fallback={loading}>
                <AdminLayout />
              </Suspense>
            </RequireLogin>
          }
        >
          <Route index element={<Students />} />
          <Route path="reports" element={<Reports />} />
          <Route path="import" element={<Import />} />
          <Route path="stats" element={<Stats />} />
        </Route>
        <Route
          path="security-check"
          element={
            <RequireLogin>
              <Suspense fallback={loading}>
                <SecurityCheck />
              </Suspense>
            </RequireLogin>
          }
        />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

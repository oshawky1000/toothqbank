import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import Chapter from './pages/Chapter.tsx'
import Course from './pages/Course.tsx'
import Home from './pages/Home.tsx'
import Login from './pages/Login.tsx'
import NotFound from './pages/NotFound.tsx'
import Signup from './pages/Signup.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="course/:courseId" element={<Course />} />
        <Route path="course/:courseId/chapter/:chapterId" element={<Chapter />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

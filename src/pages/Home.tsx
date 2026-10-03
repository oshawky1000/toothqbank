import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'

export default function Home() {
  const { loading, profile } = useAuth()

  return (
    <section className="home">
      <h1>{profile ? `Welcome, ${profile.full_name}` : 'Practise past exam questions'}</h1>
      <p className="lead">
        MCQs for dentistry students, organised by course and chapter, with answers and
        explanations.
      </p>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : profile ? (
        <div className="card notice">
          <h2>Courses coming soon</h2>
          <p>We are preparing the question bank. Your courses will appear here shortly.</p>
        </div>
      ) : (
        <div className="card notice">
          <h2>Get started</h2>
          <p>Create a free account with your phone number. Courses will be available here shortly.</p>
          <div className="button-row">
            <Link to="/signup" className="button">
              Sign up
            </Link>
            <Link to="/login" className="button button-secondary">
              Log in
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

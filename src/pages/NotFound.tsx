import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p className="lead">The page you are looking for does not exist.</p>
      <Link to="/" className="button">
        Go to home
      </Link>
    </section>
  )
}

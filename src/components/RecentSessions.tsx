import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/format.ts'
import { deleteSession, loadRecentSessions, type SessionSummary } from '../lib/practice.ts'
import { percent } from '../lib/progress.ts'

// On the course page: unfinished sessions to resume, and recent results.
export default function RecentSessions({ courseId }: { courseId: string }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadRecentSessions(courseId)
      .then((list) => {
        if (!cancelled) setSessions(list)
      })
      .catch(() => {
        // Extra information only; the course page still works without it.
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  if (!sessions || sessions.length === 0) return null

  const unfinished = sessions.filter((s) => !s.finished_at)
  const finished = sessions.filter((s) => s.finished_at).slice(0, 5)

  async function discard(session: SessionSummary) {
    if (!window.confirm('Discard this unfinished session? Your answers in it will be deleted.')) return
    setError(null)
    if (await deleteSession(session.id)) {
      setSessions((list) => list?.filter((s) => s.id !== session.id) ?? null)
    } else {
      setError('Could not discard the session. Check your internet connection and try again.')
    }
  }

  const describe = (s: SessionSummary) =>
    `${s.mode === 'timed' ? 'Timed' : 'Tutor'} · ${s.total} question${s.total === 1 ? '' : 's'} · ${formatDate(s.created_at)}`

  return (
    <div className="stack">
      {unfinished.length > 0 && (
        <div className="card">
          <h2>Continue where you left off</h2>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <ul className="session-list">
            {unfinished.map((s) => (
              <li key={s.id} className="session-row">
                <div>
                  <p className="session-row-title">{describe(s)}</p>
                  <p className="muted small">
                    {s.answered} of {s.total} answered
                  </p>
                </div>
                <div className="button-row">
                  <Link to={`/session/${s.id}`} className="button button-small grow">
                    Resume
                  </Link>
                  <button type="button" className="button button-small button-secondary grow" onClick={() => discard(s)}>
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {finished.length > 0 && (
        <div className="card">
          <h2>Recent results</h2>
          <ul className="session-list">
            {finished.map((s) => (
              <li key={s.id}>
                <Link to={`/session/${s.id}`} className="session-row session-row-link">
                  <div>
                    <p className="session-row-title">{describe(s)}</p>
                    <p className="muted small">
                      {s.correct} / {s.total} correct ({percent(s.correct, s.total)}%)
                    </p>
                  </div>
                  <span className="chapter-arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

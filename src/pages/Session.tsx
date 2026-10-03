import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadProblem from '../components/LoadProblem.tsx'
import ReportForm from '../components/ReportForm.tsx'
import {
  finishSession,
  loadSession,
  saveAnswer,
  saveFlag,
  savePosition,
  type Item,
  type LoadedSession,
} from '../lib/practice.ts'
import { percent } from '../lib/progress.ts'

export default function Session() {
  const { sessionId = '' } = useParams()
  const [data, setData] = useState<LoadedSession | null | 'missing'>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(false)
    loadSession(sessionId)
      .then((result) => {
        if (!cancelled) setData(result ?? 'missing')
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, attempt])

  if (error) return <LoadProblem what="this session" onRetry={() => setAttempt((n) => n + 1)} />
  if (data === null) return <p className="muted">Loading session…</p>
  if (data === 'missing') {
    return (
      <section>
        <h1>Session not found</h1>
        <p className="lead">This practice session does not exist or belongs to another account.</p>
        <Link to="/" className="button">
          Go to home
        </Link>
      </section>
    )
  }
  return <Runner key={data.session.id} data={data} />
}

function Runner({ data }: { data: LoadedSession }) {
  const { session, questions } = data
  const [items, setItems] = useState<Item[]>(data.items)
  const [index, setIndex] = useState(() => Math.min(session.current_position, data.items.length - 1))
  const [finishedAt, setFinishedAt] = useState(session.finished_at)
  const [showSummary, setShowSummary] = useState(session.finished_at !== null)
  const [showNavigator, setShowNavigator] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const shownAt = useRef(Date.now())

  const item = items[index]
  const question = item ? questions.get(item.question_id) : undefined
  const courseLink = `/course/${session.course_id}`

  // Start timing each question when it appears, and remember where the student is.
  useEffect(() => {
    shownAt.current = Date.now()
    setMessage(null)
    if (!finishedAt) savePosition(session.id, index)
  }, [index, finishedAt, session.id])

  const updateItem = (position: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.position === position ? { ...it, ...patch } : it)))

  async function choose(key: string) {
    if (!item || item.chosen !== null || finishedAt || saving) return
    setSaving(true)
    setMessage(null)
    const result = await saveAnswer(session.id, item.position, key, (Date.now() - shownAt.current) / 1000)
    setSaving(false)
    if ('error' in result) setMessage(result.error)
    else updateItem(item.position, { chosen: key, is_correct: result.is_correct })
  }

  async function toggleFlag() {
    if (!item) return
    const flagged = !item.flagged
    updateItem(item.position, { flagged })
    if (!(await saveFlag(session.id, item.position, flagged))) {
      updateItem(item.position, { flagged: !flagged })
      setMessage('The flag was not saved. Check your internet connection.')
    }
  }

  async function finish() {
    const unanswered = items.filter((it) => it.chosen === null).length
    if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Finish anyway?`)) {
      return
    }
    setSaving(true)
    const at = await finishSession(session.id)
    setSaving(false)
    if (!at) {
      setMessage('Could not finish the session. Check your internet connection and try again.')
      return
    }
    setFinishedAt(at)
    setShowSummary(true)
  }

  if (items.length === 0) {
    return (
      <section>
        <h1>This session is empty</h1>
        <Link to={courseLink} className="button">
          Back to course
        </Link>
      </section>
    )
  }

  if (showSummary) {
    const correct = items.filter((it) => it.is_correct === true).length
    const wrong = items.filter((it) => it.is_correct === false).length
    const unanswered = items.length - correct - wrong
    return (
      <section className="session-summary">
        <h1>Session complete</h1>
        <div className="card score-card">
          <p className="score-big">
            {correct} / {items.length}
          </p>
          <p className="muted">{percent(correct, items.length)}% correct</p>
          <p className="score-breakdown">
            {correct} correct · {wrong} incorrect · {unanswered} unanswered
          </p>
        </div>
        <div className="stack">
          <button
            type="button"
            className="button button-block"
            onClick={() => {
              setIndex(0)
              setShowSummary(false)
            }}
          >
            Review questions
          </button>
          <Link to={`${courseLink}/practice`} className="button button-secondary button-block">
            New session
          </Link>
          <Link to={courseLink} className="button button-secondary button-block">
            Back to course
          </Link>
        </div>
      </section>
    )
  }

  const answered = item.chosen !== null
  const isLast = index === items.length - 1

  return (
    <section
      className="session no-copy"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
    >
      <div className="session-top">
        <Link to={courseLink} className="back-link">
          ← Exit
        </Link>
        <span className="session-count">
          Question {index + 1} of {items.length}
        </span>
      </div>

      <div className="session-tools">
        <button
          type="button"
          className={item.flagged ? 'chip active' : 'chip'}
          aria-pressed={item.flagged}
          onClick={toggleFlag}
        >
          {item.flagged ? '⚑ Flagged' : '⚐ Flag for review'}
        </button>
        <button
          type="button"
          className={showNavigator ? 'chip active' : 'chip'}
          aria-expanded={showNavigator}
          onClick={() => setShowNavigator((v) => !v)}
        >
          All questions
        </button>
      </div>

      {showNavigator && (
        <nav className="navigator" aria-label="Questions">
          {items.map((it, i) => {
            const state = it.is_correct === true ? 'right' : it.is_correct === false ? 'wrong' : 'open'
            return (
              <button
                key={it.position}
                type="button"
                className={`nav-cell nav-${state}${i === index ? ' current' : ''}${it.flagged ? ' flagged' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => {
                  setIndex(i)
                  setShowNavigator(false)
                }}
              >
                {i + 1}
              </button>
            )
          })}
        </nav>
      )}

      {!question ? (
        <div className="card coming-soon">
          <p>This question is no longer available. Move to the next one.</p>
        </div>
      ) : (
        <article className="question">
          {question.times_seen >= 2 && <span className="badge seen-badge">Seen in {question.times_seen} papers</span>}
          <p className="stem">{question.stem}</p>

          <div className="options" role="list">
            {question.options.map((option) => {
              let state = ''
              if (answered) {
                if (option.key === question.answer) state = ' option-correct'
                else if (option.key === item.chosen) state = ' option-wrong'
                else state = ' option-dim'
              }
              return (
                <button
                  key={option.key}
                  type="button"
                  role="listitem"
                  className={`option${state}`}
                  disabled={answered || saving || finishedAt !== null}
                  onClick={() => choose(option.key)}
                >
                  <span className="option-key">{option.key}</span>
                  <span className="option-text">{option.text}</span>
                </button>
              )
            })}
          </div>

          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}

          {answered && (
            <div className={item.is_correct ? 'feedback feedback-correct' : 'feedback feedback-wrong'} role="status">
              <p className="feedback-title">
                {item.is_correct ? 'Correct' : `Incorrect. The answer is ${question.answer}.`}
              </p>
              {question.explanation && <p className="explanation">{question.explanation}</p>}
            </div>
          )}

          <ReportForm key={question.id} questionId={question.id} />
        </article>
      )}

      <div className="session-nav">
        <button
          type="button"
          className="button button-secondary grow"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          Previous
        </button>
        {isLast ? (
          finishedAt ? (
            <button type="button" className="button grow" onClick={() => setShowSummary(true)}>
              See score
            </button>
          ) : (
            <button type="button" className="button grow" disabled={saving} onClick={finish}>
              Finish
            </button>
          )
        ) : (
          <button type="button" className="button grow" onClick={() => setIndex((i) => i + 1)}>
            Next
          </button>
        )}
      </div>
    </section>
  )
}

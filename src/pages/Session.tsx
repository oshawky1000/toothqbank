import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadProblem from '../components/LoadProblem.tsx'
import ReportForm from '../components/ReportForm.tsx'
import {
  finishSession,
  loadSession,
  saveAnswer,
  saveFlag,
  saveProgress,
  type Item,
  type LoadedSession,
  type Question,
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
  if (data.items.length === 0) {
    return (
      <section>
        <h1>This session is empty</h1>
        <Link to={`/course/${data.session.course_id}`} className="button">
          Back to course
        </Link>
      </section>
    )
  }
  return <Runner key={data.session.id} data={data} />
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(s / 60)
  return `${minutes}:${String(s % 60).padStart(2, '0')}`
}

function Runner({ data }: { data: LoadedSession }) {
  const { session, questions } = data
  const timed = session.mode === 'timed'
  const totalSeconds = data.items.length * (session.seconds_per_question ?? 60)
  const courseLink = `/course/${session.course_id}`

  const [items, setItems] = useState<Item[]>(data.items)
  const [index, setIndex] = useState(() => Math.min(session.current_position, data.items.length - 1))
  const [finishedAt, setFinishedAt] = useState(session.finished_at)
  const [view, setView] = useState<'question' | 'results'>(session.finished_at ? 'results' : 'question')
  const [timeUp, setTimeUp] = useState(false)
  const [showNavigator, setShowNavigator] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const shownAt = useRef(Date.now())
  const indexRef = useRef(index)
  const finishing = useRef(false)
  const finishedRef = useRef(session.finished_at !== null)

  // Timed sessions: time used = saved time + time since this page opened.
  const running = timed && !finishedAt
  const clock = useRef({ base: session.settings.elapsed_seconds ?? 0, since: Date.now() })
  const [, setTick] = useState(0)
  const elapsedNow = useCallback(
    () => clock.current.base + (running ? (Date.now() - clock.current.since) / 1000 : 0),
    [running],
  )
  const remaining = totalSeconds - elapsedNow()

  const item = items[index]
  const question = questions.get(item.question_id)

  const persist = useCallback(() => {
    if (finishedRef.current || finishing.current) return
    void saveProgress(session.id, {
      current_position: indexRef.current,
      ...(timed ? { settings: { ...session.settings, elapsed_seconds: Math.floor(elapsedNow()) } } : {}),
    })
  }, [session.id, session.settings, timed, elapsedNow])

  // Each new question: restart its timer, and remember where the student is.
  useEffect(() => {
    indexRef.current = index
    shownAt.current = Date.now()
    setMessage(null)
    persist()
  }, [index, persist])

  const updateItem = (position: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.position === position ? { ...it, ...patch } : it)))

  const finish = useCallback(
    async (auto: boolean) => {
      if (finishing.current) return
      if (!auto) {
        const unanswered = items.filter((it) => it.chosen === null).length
        const prompt = `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Finish anyway?`
        if (unanswered > 0 && !window.confirm(prompt)) return
      }
      finishing.current = true
      setSaving(true)
      const used = Math.min(totalSeconds, Math.floor(elapsedNow()))
      const at = await finishSession(session.id, timed ? { ...session.settings, elapsed_seconds: used } : undefined)
      setSaving(false)
      finishing.current = false
      if (!at) {
        setMessage('Could not finish the session. Check your internet connection and try again.')
        return
      }
      finishedRef.current = true
      clock.current = { base: used, since: Date.now() }
      setFinishedAt(at)
      setTimeUp(auto)
      setView('results')
    },
    [items, totalSeconds, elapsedNow, session.id, session.settings, timed],
  )

  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  // Timed sessions: tick every second, finish when time is up, and save the time used.
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => {
      setTick((n) => n + 1)
      if (totalSeconds - elapsedNow() <= 0) void finishRef.current(true)
    }, 1000)
    const save = setInterval(persist, 10000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(tick)
      clearInterval(save)
      document.removeEventListener('visibilitychange', onHide)
      persist()
    }
  }, [running, totalSeconds, elapsedNow, persist])

  async function choose(key: string) {
    if (finishedAt || saving || item.chosen === key) return
    if (!timed && item.chosen !== null) return // tutor mode: one try per question
    const seconds = (Date.now() - shownAt.current) / 1000
    const before = { chosen: item.chosen, is_correct: item.is_correct }
    setMessage(null)
    if (timed) updateItem(item.position, { chosen: key }) // show the choice straight away
    setSaving(true)
    const result = await saveAnswer(session.id, item.position, key, seconds)
    setSaving(false)
    if ('error' in result) {
      updateItem(item.position, before)
      setMessage(result.error)
    } else {
      updateItem(item.position, { chosen: key, is_correct: result.is_correct })
    }
  }

  async function toggleFlag() {
    const flagged = !item.flagged
    updateItem(item.position, { flagged })
    if (!(await saveFlag(session.id, item.position, flagged))) {
      updateItem(item.position, { flagged: !flagged })
      setMessage('The flag was not saved. Check your internet connection.')
    }
  }

  function openQuestion(i: number) {
    setIndex(i)
    setShowNavigator(false)
    setView('question')
  }

  if (view === 'results') {
    return (
      <Results
        items={items}
        questions={questions}
        timed={timed}
        timeUp={timeUp}
        secondsUsed={timed ? clock.current.base : null}
        courseLink={courseLink}
        onOpen={openQuestion}
      />
    )
  }

  // Tutor: answers show after each question. Timed: only once the session is finished.
  const reveal = finishedAt !== null || (!timed && item.chosen !== null)
  const isLast = index === items.length - 1

  return (
    <section
      className="session no-copy"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
    >
      <div className="session-top">
        {finishedAt ? (
          <button type="button" className="link-button back-link" onClick={() => setView('results')}>
            ← Results
          </button>
        ) : (
          <Link to={courseLink} className="back-link">
            ← Exit
          </Link>
        )}
        <span className="session-count">
          Question {index + 1} of {items.length}
        </span>
      </div>

      {running && (
        <div className={remaining <= 60 ? 'timer timer-low' : 'timer'} role="timer" aria-live="off">
          <span>Time left</span>
          <strong>{formatClock(remaining)}</strong>
        </div>
      )}

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
            const showResult = finishedAt !== null || !timed
            let state = it.chosen === null ? 'open' : 'answered'
            if (showResult && it.is_correct === true) state = 'right'
            if (showResult && it.is_correct === false) state = 'wrong'
            return (
              <button
                key={it.position}
                type="button"
                className={`nav-cell nav-${state}${i === index ? ' current' : ''}${it.flagged ? ' flagged' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => openQuestion(i)}
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
              if (reveal) {
                if (option.key === question.answer) state = ' option-correct'
                else if (option.key === item.chosen) state = ' option-wrong'
                else state = ' option-dim'
              } else if (option.key === item.chosen) {
                state = ' option-selected'
              }
              return (
                <button
                  key={option.key}
                  type="button"
                  role="listitem"
                  className={`option${state}`}
                  disabled={reveal || saving || finishedAt !== null}
                  aria-pressed={option.key === item.chosen}
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

          {reveal && (
            <div
              className={
                item.chosen === null
                  ? 'feedback'
                  : item.is_correct
                    ? 'feedback feedback-correct'
                    : 'feedback feedback-wrong'
              }
              role="status"
            >
              <p className="feedback-title">
                {item.chosen === null
                  ? `Not answered. The answer is ${question.answer}.`
                  : item.is_correct
                    ? 'Correct'
                    : `Incorrect. The answer is ${question.answer}.`}
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
        {!isLast ? (
          <button type="button" className="button grow" onClick={() => setIndex((i) => i + 1)}>
            Next
          </button>
        ) : finishedAt ? (
          <button type="button" className="button grow" onClick={() => setView('results')}>
            Results
          </button>
        ) : (
          <button type="button" className="button grow" disabled={saving} onClick={() => finish(false)}>
            Finish
          </button>
        )}
      </div>
    </section>
  )
}

type ResultFilter = 'all' | 'incorrect' | 'unanswered' | 'flagged'

function Results({
  items,
  questions,
  timed,
  timeUp,
  secondsUsed,
  courseLink,
  onOpen,
}: {
  items: Item[]
  questions: Map<string, Question>
  timed: boolean
  timeUp: boolean
  secondsUsed: number | null
  courseLink: string
  onOpen: (index: number) => void
}) {
  const [filter, setFilter] = useState<ResultFilter>('all')
  const correct = items.filter((it) => it.is_correct === true).length
  const wrong = items.filter((it) => it.is_correct === false).length
  const unanswered = items.filter((it) => it.chosen === null).length

  const matches = (it: Item) =>
    filter === 'all' ||
    (filter === 'incorrect' && it.is_correct === false) ||
    (filter === 'unanswered' && it.chosen === null) ||
    (filter === 'flagged' && it.flagged)
  const filters: { value: ResultFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: items.length },
    { value: 'incorrect', label: 'Incorrect', count: wrong },
    { value: 'unanswered', label: 'Unanswered', count: unanswered },
    { value: 'flagged', label: 'Flagged', count: items.filter((it) => it.flagged).length },
  ]

  return (
    <section className="session-summary">
      <h1>Results</h1>
      {timeUp && (
        <div className="banner banner-warning" role="status">
          <p>Time is up. Your answers were saved.</p>
        </div>
      )}
      <div className="card score-card">
        <p className="score-big">
          {correct} / {items.length}
        </p>
        <p className="muted">{percent(correct, items.length)}% correct</p>
        <p className="score-breakdown">
          {correct} correct · {wrong} incorrect · {unanswered} unanswered
          {timed && secondsUsed !== null && ` · ${formatClock(secondsUsed)} used`}
        </p>
      </div>

      <h2>Review</h2>
      <p className="muted small">Tap a question to see the answer and explanation.</p>
      <div className="chip-row results-filter">
        {filters
          .filter((f) => f.value === 'all' || f.count > 0)
          .map((f) => (
            <button
              key={f.value}
              type="button"
              className={filter === f.value ? 'chip active' : 'chip'}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({f.count})
            </button>
          ))}
      </div>

      <ol className="result-list">
        {items.map((it, i) => {
          if (!matches(it)) return null
          const state = it.chosen === null ? 'open' : it.is_correct ? 'right' : 'wrong'
          const label = state === 'open' ? 'Not answered' : state === 'right' ? 'Correct' : 'Incorrect'
          return (
            <li key={it.position}>
              <button type="button" className="result-row" onClick={() => onOpen(i)}>
                <span className={`result-mark mark-${state}`} aria-label={label}>
                  {state === 'right' ? '✓' : state === 'wrong' ? '✗' : '–'}
                </span>
                <span className="result-body">
                  <span className="result-number">
                    Question {i + 1}
                    {it.flagged && ' · ⚑'}
                  </span>
                  <span className="result-stem">{questions.get(it.question_id)?.stem ?? 'Question no longer available'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="stack results-actions">
        <Link to={`${courseLink}/practice`} className="button button-block">
          New session
        </Link>
        <Link to={courseLink} className="button button-secondary button-block">
          Back to course
        </Link>
      </div>
    </section>
  )
}

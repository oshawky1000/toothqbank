import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import LoadProblem from '../components/LoadProblem.tsx'
import { courseAccess, SECTIONS, useCatalog, type Category, type Course } from '../lib/catalog.ts'
import {
  createSession,
  loadPool,
  pickQuestions,
  type Filter,
  type Mode,
  type Order,
  type PoolQuestion,
} from '../lib/practice.ts'
import { loadHistory, type History } from '../lib/progress.ts'
import NotFound from './NotFound.tsx'

const COUNT_PRESETS = [10, 20, 40]
// Timed mode: 1 minute per question by default.
const TIME_OPTIONS = [
  { seconds: 30, label: '30 sec' },
  { seconds: 60, label: '1 min' },
  { seconds: 90, label: '1.5 min' },
  { seconds: 120, label: '2 min' },
]
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'incorrect', label: 'Incorrect only' },
]

export default function Practice() {
  const { courseId = '' } = useParams()
  const { profile } = useAuth()
  const { loading, error, catalog, retry } = useCatalog()

  if (error) return <LoadProblem what="this course" onRetry={retry} />
  if (loading || !catalog) return <p className="muted">Loading…</p>
  const course = catalog.courses.find((c) => c.id === courseId)
  if (!course) return <NotFound />
  // Locked and coming-soon courses go back to the course page, which explains why.
  if (courseAccess(course, profile, catalog.unlockedIds) !== 'unlocked') {
    return <Navigate to={`/course/${course.id}`} replace />
  }
  return <BuilderLoader course={course} />
}

/** Loads the course's questions (ids only) and the student's past answers. */
function BuilderLoader({ course }: { course: Course }) {
  const [data, setData] = useState<{ pool: PoolQuestion[]; history: History } | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(false)
    Promise.all([loadPool(course.id), loadHistory(course.id)])
      .then(([pool, history]) => {
        if (!cancelled) setData({ pool, history })
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [course.id, attempt])

  if (error) return <LoadProblem what="the questions" onRetry={() => setAttempt((n) => n + 1)} />
  if (!data) return <p className="muted">Loading…</p>
  return <Builder course={course} pool={data.pool} history={data.history} />
}

function matchesFilter(q: PoolQuestion, filter: Filter, history: History): boolean {
  if (filter === 'unanswered') return !history.has(q.id)
  if (filter === 'incorrect') return history.get(q.id)?.is_correct === false
  return true
}

function Builder({ course, pool, history }: { course: Course; pool: PoolQuestion[]; history: History }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const chapters = course.chapters.filter((ch) => pool.some((q) => q.chapter_id === ch.id))
  const sections = SECTIONS.filter((s) => pool.some((q) => q.category === s.category))

  // A link from a chapter page preselects that chapter.
  const preselected = Number(searchParams.get('chapter'))
  const [chosenChapters, setChosenChapters] = useState<number[]>(() =>
    chapters.some((ch) => ch.id === preselected) ? [preselected] : chapters.map((ch) => ch.id),
  )
  const [chosenSections, setChosenSections] = useState<Category[]>(() => sections.map((s) => s.category))
  const [filter, setFilter] = useState<Filter>('all')
  const [order, setOrder] = useState<Order>('random')
  const [count, setCount] = useState(20)
  const [typedCount, setTypedCount] = useState('')
  const [mode, setMode] = useState<Mode>('tutor')
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = pool.filter(
    (q) =>
      chosenChapters.includes(q.chapter_id) &&
      chosenSections.includes(q.category) &&
      matchesFilter(q, filter, history),
  )
  const available = candidates.length
  const finalCount = Math.min(count, available)
  const allChapters = chosenChapters.length === chapters.length

  // How many questions each filter would give with the current chapters and sections.
  const filterCount = (f: Filter) =>
    pool.filter(
      (q) => chosenChapters.includes(q.chapter_id) && chosenSections.includes(q.category) && matchesFilter(q, f, history),
    ).length

  function toggle<T>(list: T[], value: T, on: boolean): T[] {
    return on ? [...list, value] : list.filter((v) => v !== value)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (finalCount < 1) return
    setBusy(true)
    setError(null)
    const picked = pickQuestions(candidates, order, finalCount)
    const result = await createSession(
      course.id,
      mode,
      secondsPerQuestion,
      { chapters: chosenChapters, sections: chosenSections, filter, order, count: picked.length },
      picked.map((q) => q.id),
    )
    if ('error' in result) {
      setError(result.error)
      setBusy(false)
      return
    }
    navigate(`/session/${result.id}`)
  }

  const minutes = Math.ceil((finalCount * secondsPerQuestion) / 60)

  return (
    <section className="practice-page">
      <Link to={`/course/${course.id}`} className="back-link">
        ← {course.name}
      </Link>
      <h1>New practice session</h1>

      <form className="stack" onSubmit={handleSubmit}>
        <fieldset className="card builder-group">
          <legend>Chapters</legend>
          <label className="checkbox-row select-all">
            <input
              type="checkbox"
              checked={allChapters}
              onChange={(e) => setChosenChapters(e.target.checked ? chapters.map((ch) => ch.id) : [])}
            />
            <span>Select all</span>
          </label>
          <div className="checkbox-list">
            {chapters.map((ch) => (
              <label key={ch.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={chosenChapters.includes(ch.id)}
                  onChange={(e) => setChosenChapters((list) => toggle(list, ch.id, e.target.checked))}
                />
                <span>{ch.name}</span>
                <span className="muted small">{pool.filter((q) => q.chapter_id === ch.id).length}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card builder-group">
          <legend>Sections</legend>
          <div className="checkbox-list">
            {sections.map((s) => (
              <label key={s.category} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={chosenSections.includes(s.category)}
                  onChange={(e) => setChosenSections((list) => toggle(list, s.category, e.target.checked))}
                />
                <span>{s.label}</span>
                <span className="muted small">{pool.filter((q) => q.category === s.category).length}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card builder-group">
          <legend>Questions</legend>
          <div className="checkbox-list">
            {FILTERS.map((f) => (
              <label key={f.value} className="checkbox-row">
                <input type="radio" name="filter" checked={filter === f.value} onChange={() => setFilter(f.value)} />
                <span>{f.label}</span>
                <span className="muted small">{filterCount(f.value)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card builder-group">
          <legend>Order</legend>
          <div className="checkbox-list">
            <label className="checkbox-row">
              <input type="radio" name="order" checked={order === 'random'} onChange={() => setOrder('random')} />
              <span>Random</span>
            </label>
            <label className="checkbox-row">
              <input
                type="radio"
                name="order"
                checked={order === 'most_repeated'}
                onChange={() => setOrder('most_repeated')}
              />
              <span>Most repeated first</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="card builder-group">
          <legend>Number of questions</legend>
          <div className="chip-row">
            {COUNT_PRESETS.filter((n) => n < available).map((n) => (
              <button
                key={n}
                type="button"
                className={count === n ? 'chip active' : 'chip'}
                aria-pressed={count === n}
                onClick={() => {
                  setCount(n)
                  setTypedCount('')
                }}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={count >= available ? 'chip active' : 'chip'}
              aria-pressed={count >= available}
              onClick={() => {
                setCount(available)
                setTypedCount('')
              }}
            >
              All ({available})
            </button>
          </div>
          <label className="field count-field">
            <span className="field-label">Or type a number</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(available, 1)}
              placeholder={`1 to ${available}`}
              value={typedCount}
              onChange={(e) => {
                setTypedCount(e.target.value)
                const n = Math.floor(Number(e.target.value))
                if (n >= 1) setCount(n)
              }}
            />
          </label>
        </fieldset>

        <fieldset className="card builder-group">
          <legend>Mode</legend>
          <div className="checkbox-list">
            <label className="checkbox-row">
              <input type="radio" name="mode" checked={mode === 'tutor'} onChange={() => setMode('tutor')} />
              <span>
                <strong>Tutor</strong>
                <span className="block muted small">See the answer and explanation after each question.</span>
              </span>
            </label>
            <label className="checkbox-row">
              <input type="radio" name="mode" checked={mode === 'timed'} onChange={() => setMode('timed')} />
              <span>
                <strong>Timed</strong>
                <span className="block muted small">Like an exam: answers are shown at the end.</span>
              </span>
            </label>
          </div>
          {mode === 'timed' && (
            <div className="time-options">
              <span className="field-label">Time per question</span>
              <div className="chip-row">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t.seconds}
                    type="button"
                    className={secondsPerQuestion === t.seconds ? 'chip active' : 'chip'}
                    aria-pressed={secondsPerQuestion === t.seconds}
                    onClick={() => setSecondsPerQuestion(t.seconds)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {finalCount > 0 && <p className="muted small">Total time: {minutes} min</p>}
            </div>
          )}
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button-block" disabled={busy || finalCount < 1}>
          {busy
            ? 'Starting…'
            : finalCount < 1
              ? filter === 'all'
                ? 'Choose at least one chapter and section'
                : 'No questions match these choices'
              : `Start ${finalCount} question${finalCount === 1 ? '' : 's'}`}
        </button>
      </form>
    </section>
  )
}

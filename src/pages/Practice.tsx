import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import LoadProblem from '../components/LoadProblem.tsx'
import { courseAccess, SECTIONS, useCatalog, type Category, type Course } from '../lib/catalog.ts'
import { createSession, type Order } from '../lib/practice.ts'
import NotFound from './NotFound.tsx'

const COUNT_PRESETS = [10, 20, 40]

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
  return <Builder course={course} />
}

function Builder({ course }: { course: Course }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const chapters = course.chapters.filter((ch) => ch.total > 0)
  const sections = SECTIONS.filter((s) => course.sections[s.category] > 0)

  // A link from a chapter page preselects that chapter.
  const preselected = Number(searchParams.get('chapter'))
  const [chosenChapters, setChosenChapters] = useState<number[]>(() =>
    chapters.some((ch) => ch.id === preselected) ? [preselected] : chapters.map((ch) => ch.id),
  )
  const [chosenSections, setChosenSections] = useState<Category[]>(() => sections.map((s) => s.category))
  const [order, setOrder] = useState<Order>('random')
  const [count, setCount] = useState(20)
  const [typedCount, setTypedCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = chapters
    .filter((ch) => chosenChapters.includes(ch.id))
    .reduce((sum, ch) => sum + chosenSections.reduce((n, cat) => n + ch.sections[cat], 0), 0)
  const finalCount = Math.min(count, available)
  const allChapters = chosenChapters.length === chapters.length

  function toggle<T>(list: T[], value: T, on: boolean): T[] {
    return on ? [...list, value] : list.filter((v) => v !== value)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (finalCount < 1) return
    setBusy(true)
    setError(null)
    const result = await createSession(course.id, {
      chapters: chosenChapters,
      sections: chosenSections,
      order,
      count: finalCount,
    })
    if ('error' in result) {
      setError(result.error)
      setBusy(false)
      return
    }
    navigate(`/session/${result.id}`)
  }

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
                <span className="muted small">{ch.total}</span>
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
                <span className="muted small">{course.sections[s.category]}</span>
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
              <input type="radio" name="mode" checked readOnly />
              <span>
                <strong>Tutor</strong>
                <span className="block muted small">See the answer and explanation after each question.</span>
              </span>
            </label>
            <label className="checkbox-row disabled">
              <input type="radio" name="mode" disabled />
              <span>
                <strong>Timed</strong>
                <span className="block muted small">Coming soon.</span>
              </span>
            </label>
          </div>
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
              ? 'Choose at least one chapter and section'
              : `Start ${finalCount} question${finalCount === 1 ? '' : 's'}`}
        </button>
      </form>
    </section>
  )
}

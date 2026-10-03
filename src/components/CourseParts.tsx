// Small pieces shared by the course page and the chapter page.

import { Link } from 'react-router-dom'
import { config } from '../config.ts'
import { SECTIONS, questionCount, type SectionCounts } from '../lib/catalog.ts'
import { percent, type ChapterProgress } from '../lib/progress.ts'
import UnlockHelp from './UnlockHelp.tsx'

/**
 * Past papers / Quizzes & midterms / Chapter questions (written questions), hiding
 * empty sections, then practical questions (questions with images) on their own.
 */
export function SectionList({ sections, practical }: { sections: SectionCounts; practical: number }) {
  const shown = SECTIONS.filter((s) => sections[s.category] > 0)
  if (shown.length === 0 && practical === 0) return null
  return (
    <div className="stack">
      {shown.length > 0 && (
        <div>
          {practical > 0 && <h2 className="section-heading">Written questions</h2>}
          <ul className="section-list">
            {shown.map((s) => (
              <li key={s.category} className="section-item">
                <span className="section-name">{s.label}</span>
                <span className="section-count">{questionCount(sections[s.category])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {practical > 0 && (
        <div>
          <h2 className="section-heading">Practical questions</h2>
          <ul className="section-list">
            <li className="section-item">
              <span className="section-name">
                {PRACTICAL_LABEL}
                <span className="block muted small">Questions with images</span>
              </span>
              <span className="section-count">{questionCount(practical)}</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

export const PRACTICAL_LABEL = 'Practical'

export function ProgressLine({ total, progress }: { total: number; progress: ChapterProgress }) {
  const answered = percent(progress.answered, total)
  return (
    <div className="progress">
      <div className="progress-track" aria-hidden="true">
        <span className="progress-fill" style={{ width: `${answered}%` }} />
      </div>
      <span className="progress-text">
        {answered}% answered
        {progress.answered > 0 && ` · ${percent(progress.correct, progress.answered)}% correct`}
      </span>
    </div>
  )
}

export function LockedBox() {
  return (
    <div className="card lock-box">
      <h2>This course is locked</h2>
      <p className="muted">Unlock it to practise its questions.</p>
      <p className="course-price">{config.coursePrice}</p>
      <UnlockHelp />
    </div>
  )
}

export function ComingSoonBox({ what }: { what: string }) {
  return (
    <div className="card coming-soon">
      <p>Questions for this {what} are coming soon.</p>
    </div>
  )
}

export function StartPractice({
  to,
  label,
  text,
  practicalTo,
}: {
  to: string
  label: string
  text: string
  /** Shown only when there are practical questions: starts the builder on "Practical only". */
  practicalTo?: string
}) {
  return (
    <div className="card notice">
      <h2>Practice</h2>
      <p>{text}</p>
      <div className="stack">
        <Link to={to} className="button button-block">
          {label}
        </Link>
        {practicalTo && (
          <Link to={practicalTo} className="button button-secondary button-block">
            Practical questions only
          </Link>
        )}
      </div>
    </div>
  )
}

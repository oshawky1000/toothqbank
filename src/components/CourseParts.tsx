// Small pieces shared by the course page and the chapter page.

import { config } from '../config.ts'
import { SECTIONS, questionCount, type SectionCounts } from '../lib/catalog.ts'
import { percent, type ChapterProgress } from '../lib/progress.ts'
import UnlockHelp from './UnlockHelp.tsx'

/** Past papers / Quizzes & midterms / Chapter questions, hiding empty sections. */
export function SectionList({ sections }: { sections: SectionCounts }) {
  const shown = SECTIONS.filter((s) => sections[s.category] > 0)
  if (shown.length === 0) return null
  return (
    <ul className="section-list">
      {shown.map((s) => (
        <li key={s.category} className="section-item">
          <span className="section-name">{s.label}</span>
          <span className="section-count">{questionCount(sections[s.category])}</span>
        </li>
      ))}
    </ul>
  )
}

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

export function PracticeSoon() {
  return (
    <div className="card notice">
      <h2>Practice</h2>
      <p>
        Practice sessions are coming soon. You will choose chapters, sections and a mode, then answer
        questions with explanations.
      </p>
    </div>
  )
}

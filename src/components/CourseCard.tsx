import { Link } from 'react-router-dom'
import { config } from '../config.ts'
import { chapterCount, questionCount, type Access, type Course } from '../lib/catalog.ts'
import UnlockHelp from './UnlockHelp.tsx'

export function AccessBadge({ access }: { access: Access }) {
  if (access === 'unlocked') return <span className="badge badge-unlocked">Unlocked</span>
  if (access === 'locked') return <span className="badge badge-locked">Locked</span>
  return <span className="badge">Coming soon</span>
}

export default function CourseCard({ course, access }: { course: Course; access: Access }) {
  return (
    <article className={`card course-card course-${access}`}>
      <div className="course-card-head">
        <h3 className="course-name">
          {access === 'coming-soon' ? (
            course.name
          ) : (
            <Link to={`/course/${course.id}`} className="course-link">
              {course.name}
            </Link>
          )}
        </h3>
        <AccessBadge access={access} />
      </div>

      {access === 'coming-soon' ? (
        <p className="muted course-meta">Questions coming soon</p>
      ) : (
        <p className="muted course-meta">
          {questionCount(course.total)} · {chapterCount(course.chapters.length)}
        </p>
      )}

      {access === 'unlocked' && (
        <Link to={`/course/${course.id}`} className="button button-block">
          Open course
        </Link>
      )}

      {access === 'locked' && (
        <>
          <p className="course-price">{config.coursePrice}</p>
          <UnlockHelp />
        </>
      )}
    </article>
  )
}

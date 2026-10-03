import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { AccessBadge } from '../components/CourseCard.tsx'
import {
  ComingSoonBox,
  LockedBox,
  ProgressLine,
  StartPractice,
  SectionList,
} from '../components/CourseParts.tsx'
import LoadProblem from '../components/LoadProblem.tsx'
import { chapterCount, courseAccess, questionCount, semesterLabel, useCatalog } from '../lib/catalog.ts'
import { useCourseProgress } from '../lib/progress.ts'
import NotFound from './NotFound.tsx'

export default function Course() {
  const { courseId = '' } = useParams()
  const { profile } = useAuth()
  const { loading, error, catalog, retry } = useCatalog()

  const course = catalog?.courses.find((c) => c.id === courseId)
  const access = course && catalog ? courseAccess(course, profile, catalog.unlockedIds) : null
  const progress = useCourseProgress(courseId, profile?.id ?? null, access === 'unlocked')

  if (error) return <LoadProblem what="this course" onRetry={retry} />
  if (loading || !catalog) return <p className="muted">Loading course…</p>
  if (!course || !access) return <NotFound />

  const semester = catalog.semesters.find((s) => s.id === course.semester_id)

  return (
    <section className="course-page">
      <Link to="/" className="back-link">
        ← All courses
      </Link>
      {semester && <p className="eyebrow">{semesterLabel(semester)}</p>}
      <div className="page-title-row">
        <h1>{course.name}</h1>
        <AccessBadge access={access} />
      </div>
      {access !== 'coming-soon' && (
        <p className="lead">
          {questionCount(course.total)} · {chapterCount(course.chapters.length)}
        </p>
      )}

      {access === 'coming-soon' && <ComingSoonBox what="course" />}
      {access === 'locked' && <LockedBox />}

      {access !== 'coming-soon' && (
        <div className="stack">
          <SectionList sections={course.sections} />
          {access === 'unlocked' && (
            <StartPractice
              to={`/course/${course.id}/practice`}
              label="Start a practice session"
              text="Choose chapters, sections and how many questions, then practise with answers and explanations."
            />
          )}
        </div>
      )}

      <h2 className="list-title">Chapters</h2>
      {course.chapters.length === 0 ? (
        <p className="muted">Chapters for this course will be added with its questions.</p>
      ) : (
        <ol className="chapter-list">
          {course.chapters.map((chapter, index) => {
            const content = (
              <>
                <span className="chapter-number">{index + 1}</span>
                <span className="chapter-body">
                  <span className="chapter-name">{chapter.name}</span>
                  <span className="chapter-meta">
                    {chapter.total > 0 ? questionCount(chapter.total) : 'Coming soon'}
                  </span>
                  {access === 'unlocked' && chapter.total > 0 && progress && (
                    <ProgressLine
                      total={chapter.total}
                      progress={progress.get(chapter.id) ?? { answered: 0, correct: 0 }}
                    />
                  )}
                </span>
              </>
            )
            const canOpen = access === 'unlocked' && chapter.total > 0
            return (
              <li key={chapter.id}>
                {canOpen ? (
                  <Link to={`/course/${course.id}/chapter/${chapter.id}`} className="chapter-row chapter-row-link">
                    {content}
                    <span className="chapter-arrow" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                ) : (
                  <div className="chapter-row">{content}</div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

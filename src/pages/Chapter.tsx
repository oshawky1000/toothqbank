import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import {
  ComingSoonBox,
  LockedBox,
  ProgressLine,
  StartPractice,
  SectionList,
} from '../components/CourseParts.tsx'
import LoadProblem from '../components/LoadProblem.tsx'
import { courseAccess, questionCount, useCatalog } from '../lib/catalog.ts'
import { useCourseProgress } from '../lib/progress.ts'
import NotFound from './NotFound.tsx'

export default function Chapter() {
  const { courseId = '', chapterId = '' } = useParams()
  const { profile } = useAuth()
  const { loading, error, catalog, retry } = useCatalog()

  const course = catalog?.courses.find((c) => c.id === courseId)
  const chapterIndex = course?.chapters.findIndex((ch) => String(ch.id) === chapterId) ?? -1
  const chapter = course?.chapters[chapterIndex]
  const access = course && catalog ? courseAccess(course, profile, catalog.unlockedIds) : null
  const progress = useCourseProgress(courseId, profile?.id ?? null, access === 'unlocked')

  if (error) return <LoadProblem what="this chapter" onRetry={retry} />
  if (loading || !catalog) return <p className="muted">Loading chapter…</p>
  if (!course || !chapter || !access) return <NotFound />

  return (
    <section className="chapter-page">
      <Link to={`/course/${course.id}`} className="back-link">
        ← {course.name}
      </Link>
      <p className="eyebrow">Chapter {chapterIndex + 1}</p>
      <h1>{chapter.name}</h1>
      {chapter.total > 0 && <p className="lead">{questionCount(chapter.total)}</p>}

      {access === 'coming-soon' || chapter.total === 0 ? (
        <ComingSoonBox what="chapter" />
      ) : access === 'locked' ? (
        <LockedBox />
      ) : (
        <div className="stack">
          {progress && (
            <div className="card">
              <h2>Your progress</h2>
              <ProgressLine total={chapter.total} progress={progress.get(chapter.id) ?? { answered: 0, correct: 0 }} />
            </div>
          )}
          <SectionList sections={chapter.sections} practical={chapter.practical} />
          <StartPractice
            to={`/course/${course.id}/practice?chapter=${chapter.id}`}
            label="Practise this chapter"
            text="Start a session with this chapter selected. You can add more chapters before starting."
            practicalTo={
              chapter.practical > 0 ? `/course/${course.id}/practice?chapter=${chapter.id}&type=practical` : undefined
            }
          />
        </div>
      )}
    </section>
  )
}

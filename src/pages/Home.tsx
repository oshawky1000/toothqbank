import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import CourseCard from '../components/CourseCard.tsx'
import LoadProblem from '../components/LoadProblem.tsx'
import { courseAccess, useCatalog, type Semester } from '../lib/catalog.ts'

export default function Home() {
  const { loading: authLoading, profile } = useAuth()
  const { loading, error, catalog, retry } = useCatalog()

  // Year -> semesters, in order.
  const years = new Map<number, Semester[]>()
  for (const semester of catalog?.semesters ?? []) {
    years.set(semester.year, [...(years.get(semester.year) ?? []), semester])
  }

  return (
    <section className="home">
      <h1>{profile ? `Welcome, ${profile.full_name}` : 'Practise past exam questions'}</h1>
      <p className="lead">
        MCQs for dentistry students, organised by course and chapter, with answers and
        explanations.
      </p>

      {!authLoading && !profile && (
        <div className="card notice home-intro">
          <h2>Get started</h2>
          <p>Create a free account with your phone number, then ask an admin to unlock your courses.</p>
          <div className="button-row">
            <Link to="/signup" className="button">
              Sign up
            </Link>
            <Link to="/login" className="button button-secondary">
              Log in
            </Link>
          </div>
        </div>
      )}

      {error ? (
        <LoadProblem what="the courses" onRetry={retry} />
      ) : loading || !catalog ? (
        <p className="muted">Loading courses…</p>
      ) : (
        [...years].map(([year, semesters]) => (
          <section key={year} className="year">
            <h2 className="year-title">Year {year}</h2>
            {semesters.map((semester) => {
              const courses = catalog.courses.filter((c) => c.semester_id === semester.id)
              return (
                <section key={semester.id} className="semester">
                  <h3 className="semester-title">Semester {semester.number}</h3>
                  {courses.length === 0 ? (
                    <div className="card coming-soon">
                      <p>Courses for this semester are coming soon.</p>
                    </div>
                  ) : (
                    <div className="course-grid">
                      {courses.map((course) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          access={courseAccess(course, profile, catalog.unlockedIds)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </section>
        ))
      )}
    </section>
  )
}

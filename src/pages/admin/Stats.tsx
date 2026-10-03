import LoadProblem from '../../components/LoadProblem.tsx'
import { STATUS_LABELS, useStudents } from '../../lib/admin.ts'
import { useCatalog } from '../../lib/catalog.ts'
import type { AccountStatus } from '../../lib/supabase.ts'

const STATUSES: AccountStatus[] = ['pending', 'approved', 'rejected', 'revoked']

export default function Stats() {
  const { students, error, retry } = useStudents()
  const catalog = useCatalog()

  if (error || catalog.error) {
    return (
      <LoadProblem
        what="the stats"
        onRetry={() => {
          retry()
          catalog.retry()
        }}
      />
    )
  }
  if (!students || !catalog.catalog) return <p className="muted">Loading stats…</p>

  return (
    <div className="stack">
      <div className="card">
        <h2>Students</h2>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-number">{students.length}</span>
            <span className="stat-label">Total</span>
          </div>
          {STATUSES.map((status) => (
            <div key={status} className="stat">
              <span className="stat-number">{students.filter((s) => s.status === status).length}</span>
              <span className="stat-label">{STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Courses</h2>
        <table className="stat-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Unlocks</th>
              <th>Questions</th>
            </tr>
          </thead>
          <tbody>
            {catalog.catalog.courses.map((course) => (
              <tr key={course.id}>
                <td>{course.name}</td>
                <td>{students.filter((s) => s.unlocked.includes(course.id)).length}</td>
                <td>{course.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { useState } from 'react'
import LoadProblem from '../../components/LoadProblem.tsx'
import { formatPhone, STATUS_LABELS, useStudents } from '../../lib/admin.ts'
import { useCatalog } from '../../lib/catalog.ts'
import type { AccountStatus } from '../../lib/supabase.ts'
import StudentCard from './StudentCard.tsx'

type Filter = AccountStatus | 'all'

// Pending students come first, then newest first.
const STATUS_ORDER: Record<AccountStatus, number> = { pending: 0, approved: 1, rejected: 2, revoked: 3 }
const FILTERS: Filter[] = ['all', 'pending', 'approved', 'rejected', 'revoked']

export default function Students() {
  const { students, error, retry, patchStudent } = useStudents()
  const catalog = useCatalog()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  if (error || catalog.error) {
    return (
      <LoadProblem
        what="the students"
        onRetry={() => {
          retry()
          catalog.retry()
        }}
      />
    )
  }
  if (!students || !catalog.catalog) return <p className="muted">Loading students…</p>

  const query = search.trim().toLowerCase()
  const digits = query.replace(/\D/g, '')
  const matches = students.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false
    if (!query) return true
    if (s.full_name.toLowerCase().includes(query)) return true
    return digits.length >= 3 && (s.phone.includes(digits) || formatPhone(s.phone).includes(digits))
  })
  matches.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.created_at.localeCompare(a.created_at),
  )

  const countFor = (f: Filter) => (f === 'all' ? students.length : students.filter((s) => s.status === f).length)

  return (
    <div className="stack">
      <input
        type="search"
        className="search-input"
        placeholder="Search name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="chip-row" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'chip active' : 'chip'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]} ({countFor(f)})
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <p className="muted">No students found.</p>
      ) : (
        matches.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            courses={catalog.catalog!.courses}
            onChange={(patch) => patchStudent(student.id, patch)}
          />
        ))
      )}
    </div>
  )
}

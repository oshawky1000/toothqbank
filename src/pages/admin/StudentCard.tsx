import { useState, type FormEvent } from 'react'
import { PASSWORD_MIN_LENGTH } from '../../auth/AuthContext.tsx'
import type { Course } from '../../lib/catalog.ts'
import {
  formatDate,
  formatPhone,
  resetDevice,
  resetPassword,
  saveNotes,
  setCourseUnlocked,
  setStatus,
  STATUS_LABELS,
  type Student,
} from '../../lib/admin.ts'
import type { AccountStatus } from '../../lib/supabase.ts'

type Props = {
  student: Student
  courses: Course[]
  onChange: (patch: Partial<Student>) => void
}

// Which buttons each status shows. Every change can be undone with another button.
const STATUS_ACTIONS: Record<AccountStatus, { label: string; to: AccountStatus; confirm?: string }[]> = {
  pending: [
    { label: 'Approve', to: 'approved' },
    { label: 'Reject', to: 'rejected', confirm: 'Reject this student?' },
  ],
  approved: [
    { label: 'Revoke', to: 'revoked', confirm: 'Revoke access? The student will lose access to all questions.' },
    { label: 'Move back to pending', to: 'pending' },
  ],
  rejected: [
    { label: 'Restore to pending', to: 'pending' },
    { label: 'Approve', to: 'approved' },
  ],
  revoked: [{ label: 'Restore (approve again)', to: 'approved' }],
}

export default function StudentCard({ student, courses, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSet, setPasswordSet] = useState<string | null>(null)
  const [notes, setNotes] = useState(student.notes)
  const [notesSaved, setNotesSaved] = useState(false)

  async function run(action: () => Promise<string | null>, patch?: Partial<Student>): Promise<boolean> {
    setBusy(true)
    setError(null)
    const problem = await action()
    setBusy(false)
    if (problem) {
      setError(problem)
      return false
    }
    if (patch) onChange(patch)
    return true
  }

  function changeStatus(to: AccountStatus, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    run(() => setStatus(student.id, to), { status: to })
  }

  function toggleCourse(courseId: string, unlocked: boolean) {
    const next = unlocked
      ? [...student.unlocked, courseId]
      : student.unlocked.filter((id) => id !== courseId)
    run(() => setCourseUnlocked(student.id, courseId, unlocked), { unlocked: next })
  }

  function handleResetDevice() {
    if (!window.confirm('Reset the device? The next phone or browser this student logs in on becomes their device.')) {
      return
    }
    run(() => resetDevice(student.id), { device_bound: false, device_bound_at: null })
  }

  async function handlePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordSet(null)
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`The new password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    if (await run(() => resetPassword(student.id, newPassword))) {
      setPasswordSet(newPassword)
      setNewPassword('')
    }
  }

  async function handleNotes(event: FormEvent) {
    event.preventDefault()
    setNotesSaved(false)
    if (await run(() => saveNotes(student.id, notes.trim()), { notes: notes.trim() })) setNotesSaved(true)
  }

  const unlockedNames = courses.filter((c) => student.unlocked.includes(c.id)).map((c) => c.name)

  return (
    <article className="card student-card">
      <div className="student-head">
        <div className="student-id">
          <h3 className="student-name">{student.full_name}</h3>
          <span className="student-phone">{formatPhone(student.phone)}</span>
        </div>
        <span className={`badge status-${student.status}`}>{STATUS_LABELS[student.status]}</span>
      </div>

      <p className="student-meta">
        Registered {formatDate(student.created_at)} · Device: {student.device_bound ? 'Yes' : 'No'}
        <br />
        Courses: {unlockedNames.length > 0 ? unlockedNames.join(', ') : 'none'}
      </p>
      {student.notes && !open && <p className="student-notes">{student.notes}</p>}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="button-row">
        {student.status === 'pending' && (
          <button
            type="button"
            className="button grow"
            disabled={busy}
            onClick={() => changeStatus('approved')}
          >
            Approve
          </button>
        )}
        <button
          type="button"
          className="button button-secondary grow"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Manage'}
        </button>
      </div>

      {open && (
        <div className="student-manage">
          <section>
            <h4>Account: {STATUS_LABELS[student.status]}</h4>
            <div className="button-row">
              {STATUS_ACTIONS[student.status].map((action) => (
                <button
                  key={action.to}
                  type="button"
                  className={action.to === 'approved' ? 'button grow' : 'button button-secondary grow'}
                  disabled={busy}
                  onClick={() => changeStatus(action.to, action.confirm)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h4>Courses</h4>
            <div className="checkbox-list">
              {courses.map((course) => (
                <label key={course.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={student.unlocked.includes(course.id)}
                    disabled={busy}
                    onChange={(e) => toggleCourse(course.id, e.target.checked)}
                  />
                  <span>{course.name}</span>
                  {course.total === 0 && <span className="muted small">no questions yet</span>}
                </label>
              ))}
            </div>
            {student.status !== 'approved' && (
              <p className="muted small">Unlocked courses only open once the account is approved.</p>
            )}
          </section>

          <section>
            <h4>Device</h4>
            <p className="small">
              {student.device_bound
                ? `Bound to a device${student.device_bound_at ? ` since ${formatDate(student.device_bound_at)}` : ''}.`
                : 'No device yet. The next device to log in becomes this student’s device.'}
            </p>
            <button
              type="button"
              className="button button-secondary button-block"
              disabled={busy || !student.device_bound}
              onClick={handleResetDevice}
            >
              Reset device
            </button>
          </section>

          <section>
            <h4>Password</h4>
            <form className="inline-form" onSubmit={handlePassword}>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button type="submit" className="button button-secondary" disabled={busy}>
                Set password
              </button>
            </form>
            {passwordSet && (
              <div className="note password-done" role="status">
                <p>
                  New password set: <strong className="mono">{passwordSet}</strong>
                </p>
                <p className="small">Send it to the student. It will not be shown again.</p>
              </div>
            )}
          </section>

          <section>
            <h4>Notes</h4>
            <form className="form-tight" onSubmit={handleNotes}>
              <textarea
                rows={3}
                placeholder="e.g. Paid InstaPay 3 Nov, GM1"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                  setNotesSaved(false)
                }}
              />
              <div className="button-row align-center">
                <button type="submit" className="button button-secondary" disabled={busy}>
                  Save notes
                </button>
                {notesSaved && <span className="muted small">Saved</span>}
              </div>
            </form>
          </section>
        </div>
      )}
    </article>
  )
}

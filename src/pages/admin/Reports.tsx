import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.tsx'
import LoadProblem from '../../components/LoadProblem.tsx'
import { formatDate, formatPhone } from '../../lib/admin.ts'
import { supabase } from '../../lib/supabase.ts'

type Report = {
  id: number
  reason: string
  comment: string
  created_at: string
  resolved_at: string | null
  question: {
    id: string
    course_id: string
    stem: string
    options: { key: string; text: string }[]
    answer: string
  } | null
  student: { full_name: string; phone: string } | null
}

export default function Reports() {
  const { profile } = useAuth()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [showResolved, setShowResolved] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(false)
    supabase
      .from('question_reports')
      .select(
        'id, reason, comment, created_at, resolved_at, ' +
          'question:questions(id, course_id, stem, options, answer), ' +
          'student:profiles!question_reports_student_id_fkey(full_name, phone)',
      )
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) setError(true)
        else setReports(data as unknown as Report[])
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function setResolved(report: Report, resolved: boolean) {
    setBusyId(report.id)
    setActionError(null)
    const resolved_at = resolved ? new Date().toISOString() : null
    const { error: updateError } = await supabase
      .from('question_reports')
      .update({ resolved_at, resolved_by: resolved ? profile?.id : null })
      .eq('id', report.id)
    setBusyId(null)
    if (updateError) {
      setActionError('That did not work. Check your internet connection and try again.')
      return
    }
    setReports((list) => list?.map((r) => (r.id === report.id ? { ...r, resolved_at } : r)) ?? null)
  }

  if (error) return <LoadProblem what="the reports" onRetry={() => setAttempt((n) => n + 1)} />
  if (!reports) return <p className="muted">Loading reports…</p>

  const openCount = reports.filter((r) => !r.resolved_at).length
  const shown = reports.filter((r) => showResolved || !r.resolved_at)

  return (
    <div className="stack">
      <div className="chip-row">
        <button
          type="button"
          className={!showResolved ? 'chip active' : 'chip'}
          aria-pressed={!showResolved}
          onClick={() => setShowResolved(false)}
        >
          Open ({openCount})
        </button>
        <button
          type="button"
          className={showResolved ? 'chip active' : 'chip'}
          aria-pressed={showResolved}
          onClick={() => setShowResolved(true)}
        >
          All ({reports.length})
        </button>
      </div>

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="muted">{showResolved ? 'No reports yet.' : 'No open reports.'}</p>
      ) : (
        shown.map((report) => (
          <article key={report.id} className={report.resolved_at ? 'card report resolved' : 'card report'}>
            <div className="student-head">
              <div>
                <h3 className="report-reason">{report.reason}</h3>
                <span className="muted small">
                  {report.question?.id ?? 'Deleted question'} · {formatDate(report.created_at)}
                </span>
              </div>
              {report.resolved_at && <span className="badge">Resolved</span>}
            </div>

            {report.comment && <p className="report-comment">“{report.comment}”</p>}
            <p className="small muted">
              From {report.student?.full_name ?? 'unknown'}
              {report.student && ` (${formatPhone(report.student.phone)})`}
            </p>

            {report.question && (
              <details className="report-question">
                <summary>Show question</summary>
                <p>{report.question.stem}</p>
                <ul className="option-preview">
                  {report.question.options.map((o) => (
                    <li key={o.key} className={o.key === report.question!.answer ? 'correct' : undefined}>
                      <strong>{o.key}.</strong> {o.text}
                      {o.key === report.question!.answer && ' ✓'}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <button
              type="button"
              className={report.resolved_at ? 'button button-secondary button-block' : 'button button-block'}
              disabled={busyId === report.id}
              onClick={() => setResolved(report, !report.resolved_at)}
            >
              {report.resolved_at ? 'Reopen' : 'Mark as resolved'}
            </button>
          </article>
        ))
      )}
    </div>
  )
}

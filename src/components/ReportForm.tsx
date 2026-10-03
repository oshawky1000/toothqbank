import { useState, type FormEvent } from 'react'
import { REPORT_REASONS, reportQuestion } from '../lib/practice.ts'

// "Report an error" under each question. Reports appear in the admin dashboard.
export default function ReportForm({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const problem = await reportQuestion(questionId, reason, comment)
    setBusy(false)
    if (problem) setError(problem)
    else setSent(true)
  }

  if (sent) return <p className="muted small report-sent">Thanks. An admin will check this question.</p>

  if (!open) {
    return (
      <button type="button" className="link-button report-link" onClick={() => setOpen(true)}>
        Report an error
      </button>
    )
  }

  return (
    <form className="card form-tight report-form" onSubmit={handleSubmit}>
      <h3>Report an error</h3>
      <label className="field">
        <span className="field-label">What is wrong?</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Comment (optional)</span>
        <textarea
          rows={3}
          maxLength={1000}
          placeholder="e.g. The lecture says the answer is C."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button grow" disabled={busy}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="button button-secondary grow" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

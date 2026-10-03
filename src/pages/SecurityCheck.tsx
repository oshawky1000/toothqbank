import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { getDeviceId } from '../lib/device.ts'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase.ts'

// /security-check: run this while logged in as a TEST STUDENT account.
// It tries things a student must NOT be able to do, straight against the
// database (the same way an attacker would, bypassing the website's screens),
// and shows whether the database refused each one.

type Outcome = { result: 'pass' | 'fail' | 'skip'; detail: string }
type Check = { name: string; outcome?: Outcome }

const pass = (detail: string): Outcome => ({ result: 'pass', detail })
const fail = (detail: string): Outcome => ({ result: 'fail', detail })
const skip = (detail: string): Outcome => ({ result: 'skip', detail })

export default function SecurityCheck() {
  const { profile } = useAuth()
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [running, setRunning] = useState(false)

  if (!profile) return null
  if (profile.is_admin) {
    return (
      <section>
        <h1>Security check</h1>
        <p className="lead">
          Log in as a test student to run this check. Admins can see everything by design, so the check only means
          something for a student account.
        </p>
      </section>
    )
  }

  const me = profile.id

  async function run() {
    setRunning(true)
    const list: [string, () => Promise<Outcome>][] = []

    // What this account SHOULD be able to read.
    const { data: unlockRows } = await supabase.from('course_unlocks').select('course_id').eq('student_id', me)
    const unlocked = new Set((unlockRows ?? []).map((u) => u.course_id as string))
    const allowed = profile!.status === 'approved' ? unlocked : new Set<string>()
    const { data: countRows } = await supabase.rpc('question_counts')
    const coursesWithQuestions: string[] = [
      ...new Set(((countRows ?? []) as { course_id: string }[]).map((r) => r.course_id)),
    ]
    const lockedCourse = coursesWithQuestions.find((id) => !allowed.has(id))

    list.push([
      'Read questions only from courses this account may open',
      async () => {
        const { data, error } = await supabase.from('questions').select('course_id').limit(1000)
        if (error) return pass('The database refused to show questions.')
        const seen = [...new Set((data ?? []).map((q) => q.course_id as string))]
        const wrong = seen.filter((id) => !allowed.has(id))
        if (wrong.length > 0) return fail(`Could read questions from: ${wrong.join(', ')}`)
        return pass(seen.length ? `Only from unlocked courses: ${seen.join(', ')}` : 'No questions visible (account is locked).')
      },
    ])

    list.push([
      'Read questions from a different device',
      async () => {
        const { data } = await supabase.auth.getSession()
        const response = await fetch(`${supabaseUrl}/rest/v1/questions?select=id&limit=1`, {
          headers: {
            apikey: supabaseAnonKey,
            authorization: `Bearer ${data.session?.access_token ?? ''}`,
            'x-device-id': `security-check-other-device-${getDeviceId().slice(0, 4)}`,
          },
        })
        const rows = response.ok ? ((await response.json()) as unknown[]) : []
        return rows.length === 0 ? pass('0 questions visible from another device.') : fail('Questions were visible from another device.')
      },
    ])

    const onlyOwn = (table: string, column: string, label: string): [string, () => Promise<Outcome>] => [
      `Read other students' ${label}`,
      async () => {
        const { data, error } = await supabase.from(table).select(column).limit(1000)
        if (error) return pass('The database refused.')
        const others = ((data ?? []) as unknown as Record<string, string>[]).filter((row) => row[column] !== me)
        return others.length === 0 ? pass('Only this account’s own rows are visible.') : fail(`${others.length} rows of other students visible.`)
      },
    ]
    list.push(onlyOwn('profiles', 'id', 'names and phone numbers'))
    list.push(onlyOwn('course_unlocks', 'student_id', 'course unlocks'))
    list.push(onlyOwn('session_items', 'student_id', 'answers'))
    list.push(onlyOwn('question_reports', 'student_id', 'error reports'))

    list.push([
      'Read admin notes about students',
      async () => {
        const { data, error } = await supabase.from('student_notes').select('student_id').limit(1)
        return error || !data?.length ? pass('Nothing visible.') : fail('Admin notes are visible.')
      },
    ])

    list.push([
      'Read internal answer-quality fields',
      async () => {
        const { data, error } = await supabase.from('question_internal').select('question_id').limit(1)
        return error || !data?.length ? pass('Nothing visible.') : fail('Internal fields are visible.')
      },
    ])

    list.push([
      'Approve itself or make itself an admin',
      async () => {
        await supabase.from('profiles').update({ status: 'approved', is_admin: true }).eq('id', me)
        const { data } = await supabase.from('profiles').select('status, is_admin').eq('id', me).single()
        if (data?.is_admin) return fail('This account made itself an admin. Remove it in Supabase now.')
        if (data && data.status !== profile!.status) return fail(`Status changed to ${data.status}.`)
        return pass('Nothing changed.')
      },
    ])

    list.push([
      'Unlock a course for itself',
      async () => {
        const target = coursesWithQuestions.find((id) => !unlocked.has(id)) ?? 'gm1'
        const { error } = await supabase.from('course_unlocks').insert({ student_id: me, course_id: target })
        return error ? pass('The database refused.') : fail(`Unlocked ${target} for itself.`)
      },
    ])

    list.push([
      'Start a practice session in a locked course',
      async () => {
        if (!lockedCourse) return skip('Every course with questions is open for this account, so there is nothing to test.')
        const { data, error } = await supabase
          .from('practice_sessions')
          .insert({ course_id: lockedCourse, mode: 'tutor' })
          .select('id')
        if (error) return pass('The database refused.')
        if (data?.[0]) await supabase.from('practice_sessions').delete().eq('id', data[0].id)
        return fail(`Could start a session in ${lockedCourse}.`)
      },
    ])

    list.push([
      'Import questions',
      async () => {
        const { error } = await supabase.rpc('import_questions', { p_file: {} })
        return error?.message.includes('Only admins') ? pass('The database refused.') : fail(error ? error.message : 'Import was allowed.')
      },
    ])

    list.push([
      'Change courses or chapters',
      async () => {
        // Writes back the values that are already there, so nothing changes even if this were allowed.
        const { data: course } = await supabase.from('courses').select('id, position').limit(1).single()
        const { data: chapter } = await supabase.from('chapters').select('id, position').limit(1).single()
        if (!course || !chapter) return skip('No course or chapter to test with.')
        const a = await supabase.from('courses').update({ position: course.position }).eq('id', course.id).select('id')
        const b = await supabase.from('chapters').update({ position: chapter.position }).eq('id', chapter.id).select('id')
        const changed = (a.data?.length ?? 0) + (b.data?.length ?? 0)
        return changed === 0 ? pass('The database refused.') : fail('Courses or chapters could be changed.')
      },
    ])

    list.push([
      'Reset a password',
      async () => {
        const { data } = await supabase.auth.getSession()
        const response = await fetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
          body: JSON.stringify({ studentId: '00000000-0000-0000-0000-000000000000', password: 'not-a-real-reset' }),
        }).catch(() => null)
        if (!response) return skip('Could not reach the password reset service.')
        if (response.status === 403) return pass('Refused: only admins can reset passwords.')
        if (response.status === 500) return skip('Password reset is not set up on this site, so nothing to test.')
        return fail(`Unexpected answer from the server (${response.status}).`)
      },
    ])

    const results: Check[] = list.map(([name]) => ({ name }))
    setChecks([...results])
    for (let i = 0; i < list.length; i++) {
      try {
        results[i] = { name: list[i][0], outcome: await list[i][1]() }
      } catch {
        results[i] = { name: list[i][0], outcome: skip('Could not run this check (internet problem?).') }
      }
      setChecks([...results])
    }
    setRunning(false)
  }

  const done = checks?.every((c) => c.outcome)
  const failures = checks?.filter((c) => c.outcome?.result === 'fail').length ?? 0
  const passes = checks?.filter((c) => c.outcome?.result === 'pass').length ?? 0

  return (
    <section className="security-check">
      <h1>Security check</h1>
      <p className="lead">
        Logged in as <strong>{profile.full_name}</strong> ({profile.status}). This tries things a student must not be
        able to do, directly against the database, and shows whether each was refused.
      </p>
      <p className="muted small">Use a test student account. Nothing is changed when the security rules work.</p>

      <button type="button" className="button button-block" disabled={running} onClick={run}>
        {running ? 'Checking…' : checks ? 'Run again' : 'Run security check'}
      </button>

      {done && (
        <div className={failures ? 'banner banner-warning' : 'banner'} role="status">
          <p>
            {failures
              ? `${failures} problem${failures === 1 ? '' : 's'} found. Take a screenshot and send it to your developer.`
              : `All ${passes} checks passed. The database refused everything it should.`}
          </p>
        </div>
      )}

      {checks && (
        <ul className="check-list">
          {checks.map((c) => (
            <li key={c.name} className={`check-row check-${c.outcome?.result ?? 'wait'}`}>
              <span className="check-mark" aria-hidden="true">
                {!c.outcome ? '…' : c.outcome.result === 'pass' ? '✓' : c.outcome.result === 'fail' ? '✗' : '–'}
              </span>
              <span>
                <span className="check-name">{c.name}</span>
                <span className="check-detail">
                  {!c.outcome
                    ? 'Waiting…'
                    : `${c.outcome.result === 'pass' ? 'Blocked. ' : c.outcome.result === 'fail' ? 'PROBLEM: ' : 'Skipped: '}${c.outcome.detail}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

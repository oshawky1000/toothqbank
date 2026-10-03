// Data and actions for the admin dashboard. The database only allows these for
// admins (Row Level Security), so a student calling them gets nothing.

import { useCallback, useEffect, useState } from 'react'
import { supabase, type AccountStatus } from './supabase.ts'

export type Student = {
  id: string
  full_name: string
  phone: string
  status: AccountStatus
  created_at: string
  device_bound: boolean
  device_bound_at: string | null
  unlocked: string[]
  notes: string
}

type ProfileRow = {
  id: string
  full_name: string
  phone: string
  status: AccountStatus
  created_at: string
  device_id: string | null
  device_bound_at: string | null
}

async function loadStudents(): Promise<Student[]> {
  const [profiles, unlocks, notes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, status, created_at, device_id, device_bound_at')
      .eq('is_admin', false)
      .order('created_at', { ascending: false }),
    supabase.from('course_unlocks').select('student_id, course_id'),
    supabase.from('student_notes').select('student_id, notes'),
  ])
  const firstError = profiles.error || unlocks.error || notes.error
  if (firstError) throw firstError

  const unlockMap = new Map<string, string[]>()
  for (const u of unlocks.data ?? []) {
    unlockMap.set(u.student_id, [...(unlockMap.get(u.student_id) ?? []), u.course_id])
  }
  const noteMap = new Map((notes.data ?? []).map((n) => [n.student_id, n.notes as string]))

  return ((profiles.data ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    status: p.status,
    created_at: p.created_at,
    device_bound: p.device_id !== null,
    device_bound_at: p.device_bound_at,
    unlocked: unlockMap.get(p.id) ?? [],
    notes: noteMap.get(p.id) ?? '',
  }))
}

export function useStudents() {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(false)
    loadStudents()
      .then((list) => {
        if (!cancelled) setStudents(list)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  /** Updates one student on screen after an action succeeded. */
  const patchStudent = useCallback((id: string, patch: Partial<Student>) => {
    setStudents((list) => list?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? null)
  }, [])

  return { students, error, retry: () => setAttempt((n) => n + 1), patchStudent }
}

// Each action returns an error message to show, or null on success.

const FAILED = 'That did not work. Check your internet connection and try again.'

export async function setStatus(studentId: string, status: AccountStatus): Promise<string | null> {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', studentId)
  return error ? FAILED : null
}

export async function setCourseUnlocked(
  studentId: string,
  courseId: string,
  unlocked: boolean,
): Promise<string | null> {
  const { error } = unlocked
    ? await supabase
        .from('course_unlocks')
        .upsert({ student_id: studentId, course_id: courseId }, { ignoreDuplicates: true })
    : await supabase.from('course_unlocks').delete().eq('student_id', studentId).eq('course_id', courseId)
  return error ? FAILED : null
}

export async function resetDevice(studentId: string): Promise<string | null> {
  const { error } = await supabase
    .from('profiles')
    .update({ device_id: null, device_bound_at: null })
    .eq('id', studentId)
  return error ? FAILED : null
}

export async function saveNotes(studentId: string, notes: string): Promise<string | null> {
  const { error } = await supabase
    .from('student_notes')
    .upsert({ student_id: studentId, notes, updated_at: new Date().toISOString() })
  return error ? FAILED : null
}

/** Runs on Cloudflare (functions/api/admin/reset-password.ts), never in the browser. */
export async function resetPassword(studentId: string, password: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return 'Please log in again.'
  try {
    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ studentId, password }),
    })
    if (response.ok) return null
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? FAILED
  } catch {
    return FAILED
  }
}

/** 201012345678 -> 01012345678 for Egyptian numbers, otherwise +<digits>. */
export function formatPhone(digits: string): string {
  if (digits.startsWith('20') && digits.length === 12) return '0' + digits.slice(2)
  return '+' + digits
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  revoked: 'Revoked',
}

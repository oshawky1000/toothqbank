// Practice sessions: picking questions, saving answers, flags and error reports.
// The database only returns questions of courses the student has unlocked
// (Row Level Security), and it decides whether each answer is correct.

import { supabase } from './supabase.ts'
import type { Category } from './catalog.ts'

export type Order = 'random' | 'most_repeated'
export type Mode = 'tutor' | 'timed'

export type SessionSettings = {
  chapters: number[]
  sections: Category[]
  order: Order
  count: number
}

export type Option = { key: string; text: string }

export type Question = {
  id: string
  chapter_id: number
  category: Category
  stem: string
  options: Option[]
  answer: string
  explanation: string
  times_seen: number
}

export type Item = {
  position: number
  question_id: string
  chosen: string | null
  is_correct: boolean | null
  flagged: boolean
}

export type Session = {
  id: string
  course_id: string
  mode: Mode
  settings: SessionSettings
  current_position: number
  finished_at: string | null
}

const FAILED = 'That did not work. Check your internet connection and try again.'

function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Picks the questions and saves a new session. Returns its id, or an error message. */
export async function createSession(
  courseId: string,
  settings: SessionSettings,
): Promise<{ id: string } | { error: string }> {
  // Note: Supabase returns at most 1000 rows per request, enough for one course for now.
  const { data: pool, error: poolError } = await supabase
    .from('questions')
    .select('id, times_seen')
    .eq('course_id', courseId)
    .in('chapter_id', settings.chapters)
    .in('category', settings.sections)
  if (poolError) return { error: FAILED }
  if (!pool || pool.length === 0) {
    return { error: 'No questions match your choices. If this course was just unlocked, refresh the page.' }
  }

  let picked = shuffle(pool)
  if (settings.order === 'most_repeated') {
    // Sorting keeps the shuffled order among questions seen the same number of times.
    picked = picked.sort((a, b) => b.times_seen - a.times_seen)
  }
  picked = picked.slice(0, settings.count)

  const { data: session, error: sessionError } = await supabase
    .from('practice_sessions')
    .insert({ course_id: courseId, mode: 'tutor', settings: { ...settings, count: picked.length } })
    .select('id')
    .single()
  if (sessionError || !session) return { error: FAILED }

  const { error: itemsError } = await supabase
    .from('session_items')
    .insert(picked.map((q, position) => ({ session_id: session.id, position, question_id: q.id })))
  if (itemsError) {
    await supabase.from('practice_sessions').delete().eq('id', session.id)
    return { error: FAILED }
  }
  return { id: session.id }
}

export type LoadedSession = { session: Session; items: Item[]; questions: Map<string, Question> }

/** Loads a session with its questions. Returns null when it does not exist (or is not yours). */
export async function loadSession(sessionId: string): Promise<LoadedSession | null> {
  const [sessionResult, itemsResult] = await Promise.all([
    supabase
      .from('practice_sessions')
      .select('id, course_id, mode, settings, current_position, finished_at')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('session_items')
      .select('position, question_id, chosen, is_correct, flagged')
      .eq('session_id', sessionId)
      .order('position'),
  ])
  if (sessionResult.error || itemsResult.error) throw sessionResult.error ?? itemsResult.error
  if (!sessionResult.data) return null

  const items = (itemsResult.data ?? []) as Item[]
  const ids = items.map((i) => i.question_id)
  const questions = new Map<string, Question>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, chapter_id, category, stem, options, answer, explanation, times_seen')
      .in('id', ids.slice(i, i + 100))
    if (error) throw error
    for (const q of (data ?? []) as Question[]) questions.set(q.id, q)
  }
  return { session: sessionResult.data as Session, items, questions }
}

/** Saves the chosen option. The database works out whether it is correct. */
export async function saveAnswer(
  sessionId: string,
  position: number,
  chosen: string,
  secondsSpent: number,
): Promise<{ is_correct: boolean } | { error: string }> {
  const { data, error } = await supabase
    .from('session_items')
    .update({ chosen, time_spent_seconds: Math.max(0, Math.round(secondsSpent)) })
    .eq('session_id', sessionId)
    .eq('position', position)
    .select('is_correct')
    .single()
  if (error || !data) return { error: 'Your answer was not saved. Check your internet connection and try again.' }
  return { is_correct: Boolean(data.is_correct) }
}

export async function saveFlag(sessionId: string, position: number, flagged: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('session_items')
    .update({ flagged })
    .eq('session_id', sessionId)
    .eq('position', position)
  return !error
}

/** Remembers where the student is, so the session can be resumed later. */
export function savePosition(sessionId: string, position: number): void {
  void supabase.from('practice_sessions').update({ current_position: position }).eq('id', sessionId).then()
}

export async function finishSession(sessionId: string): Promise<string | null> {
  const finished_at = new Date().toISOString()
  const { error } = await supabase.from('practice_sessions').update({ finished_at }).eq('id', sessionId)
  return error ? null : finished_at
}

export const REPORT_REASONS = [
  'Wrong answer',
  'Mistake in the explanation',
  'Typo or unclear question',
  'Missing or duplicate option',
  'Other',
]

export async function reportQuestion(questionId: string, reason: string, comment: string): Promise<string | null> {
  const { error } = await supabase
    .from('question_reports')
    .insert({ question_id: questionId, reason, comment: comment.trim().slice(0, 1000) })
  return error ? FAILED : null
}

// Practice sessions: picking questions, saving answers, flags and error reports.
// The database only returns questions of courses the student has unlocked
// (Row Level Security), and it decides whether each answer is correct.

import { supabase } from './supabase.ts'
import type { Category } from './catalog.ts'

export type Order = 'random' | 'most_repeated'
export type Mode = 'tutor' | 'timed'
export type Filter = 'all' | 'unanswered' | 'incorrect'

export type SessionSettings = {
  chapters: number[]
  sections: Category[]
  filter: Filter
  order: Order
  count: number
  /** Timed sessions only: seconds used so far, so the timer can resume. */
  elapsed_seconds?: number
}

/** A question the session builder can pick (no question content). */
export type PoolQuestion = { id: string; chapter_id: number; category: Category; times_seen: number }

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
  seconds_per_question: number | null
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

// Supabase returns at most 1000 rows per request, so read in pages.
const PAGE = 1000

/** Every question of a course the student can practise: ids and labels only. */
export async function loadPool(courseId: string): Promise<PoolQuestion[]> {
  const pool: PoolQuestion[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, chapter_id, category, times_seen')
      .eq('course_id', courseId)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    pool.push(...((data ?? []) as PoolQuestion[]))
    if (!data || data.length < PAGE) return pool
  }
}

/** Puts the chosen questions in order and keeps the first `count`. */
export function pickQuestions(candidates: PoolQuestion[], order: Order, count: number): PoolQuestion[] {
  let picked = shuffle(candidates)
  if (order === 'most_repeated') {
    // Sorting keeps the shuffled order among questions seen the same number of times.
    picked = picked.sort((a, b) => b.times_seen - a.times_seen)
  }
  return picked.slice(0, count)
}

/** Saves a new session with the picked questions. Returns its id, or an error message. */
export async function createSession(
  courseId: string,
  mode: Mode,
  secondsPerQuestion: number | null,
  settings: SessionSettings,
  questionIds: string[],
): Promise<{ id: string } | { error: string }> {
  const { data: session, error: sessionError } = await supabase
    .from('practice_sessions')
    .insert({
      course_id: courseId,
      mode,
      seconds_per_question: mode === 'timed' ? secondsPerQuestion : null,
      settings: { ...settings, count: questionIds.length, ...(mode === 'timed' ? { elapsed_seconds: 0 } : {}) },
    })
    .select('id')
    .single()
  if (sessionError || !session) return { error: FAILED }

  const { error: itemsError } = await supabase
    .from('session_items')
    .insert(questionIds.map((question_id, position) => ({ session_id: session.id, position, question_id })))
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
      .select('id, course_id, mode, settings, seconds_per_question, current_position, finished_at')
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

/** Remembers where the student is (and, for timed sessions, the time used). */
export function saveProgress(sessionId: string, patch: { current_position?: number; settings?: SessionSettings }) {
  return supabase.from('practice_sessions').update(patch).eq('id', sessionId).then(({ error }) => !error)
}

export async function finishSession(sessionId: string, settings?: SessionSettings): Promise<string | null> {
  const finished_at = new Date().toISOString()
  const { error } = await supabase
    .from('practice_sessions')
    .update(settings ? { finished_at, settings } : { finished_at })
    .eq('id', sessionId)
  return error ? null : finished_at
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase.from('practice_sessions').delete().eq('id', sessionId)
  return !error
}

export type SessionSummary = {
  id: string
  mode: Mode
  created_at: string
  finished_at: string | null
  total: number
  answered: number
  correct: number
}

/** The student's recent sessions in a course, newest first. */
export async function loadRecentSessions(courseId: string): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('id, mode, created_at, finished_at, session_items(chosen, is_correct)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  type Row = {
    id: string
    mode: Mode
    created_at: string
    finished_at: string | null
    session_items: { chosen: string | null; is_correct: boolean | null }[]
  }
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    mode: row.mode,
    created_at: row.created_at,
    finished_at: row.finished_at,
    total: row.session_items.length,
    answered: row.session_items.filter((i) => i.chosen !== null).length,
    correct: row.session_items.filter((i) => i.is_correct === true).length,
  }))
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

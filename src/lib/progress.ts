// A student's progress: their latest answer to each question they answered.
// Comes from the database function my_course_history (supabase/migrations/0003),
// which only returns the student's own answers (Row Level Security).

import { useEffect, useState } from 'react'
import { supabase } from './supabase.ts'

export type ChapterProgress = { answered: number; correct: number }

/** Latest answer per question id. */
export type History = Map<string, { chapter_id: number; is_correct: boolean }>

type HistoryRow = { question_id: string; chapter_id: number; is_correct: boolean | null }

// Supabase returns at most 1000 rows per request, so read in pages.
const PAGE = 1000

export async function loadHistory(courseId: string): Promise<History> {
  const history: History = new Map()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('my_course_history', { p_course_id: courseId })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of (data ?? []) as HistoryRow[]) {
      history.set(row.question_id, { chapter_id: row.chapter_id, is_correct: Boolean(row.is_correct) })
    }
    if (!data || data.length < PAGE) return history
  }
}

/** Progress per chapter id, or null while loading (or when `enabled` is false). */
export function useCourseProgress(courseId: string, userId: string | null, enabled: boolean) {
  const [progress, setProgress] = useState<Map<number, ChapterProgress> | null>(null)

  useEffect(() => {
    setProgress(null)
    if (!enabled || !userId) return
    let cancelled = false

    loadHistory(courseId)
      .then((history) => {
        if (cancelled) return
        const result = new Map<number, ChapterProgress>()
        for (const answer of history.values()) {
          const p = result.get(answer.chapter_id) ?? { answered: 0, correct: 0 }
          p.answered += 1
          if (answer.is_correct) p.correct += 1
          result.set(answer.chapter_id, p)
        }
        setProgress(result)
      })
      .catch(() => {
        // Progress is extra information; the page still works without it.
      })

    return () => {
      cancelled = true
    }
  }, [courseId, userId, enabled])

  return progress
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

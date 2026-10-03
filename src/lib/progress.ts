// A student's progress per chapter: how many questions they answered, and how
// many of those they got right on their latest try. Students can only read
// their own answers (Row Level Security), and practice arrives in Phase 5.
// Note: Supabase returns at most 1000 rows per request. Fine for now; Phase 6
// (saved progress) should move this count into the database.

import { useEffect, useState } from 'react'
import { supabase } from './supabase.ts'

export type ChapterProgress = { answered: number; correct: number }

type AnswerRow = {
  question_id: string
  is_correct: boolean | null
  questions: { chapter_id: number } | null
}

/** Progress per chapter id, or null while loading (or when `enabled` is false). */
export function useCourseProgress(courseId: string, userId: string | null, enabled: boolean) {
  const [progress, setProgress] = useState<Map<number, ChapterProgress> | null>(null)

  useEffect(() => {
    setProgress(null)
    if (!enabled || !userId) return
    let cancelled = false

    supabase
      .from('session_items')
      .select('question_id, is_correct, questions!inner(chapter_id)')
      .eq('student_id', userId)
      .eq('questions.course_id', courseId)
      .not('chosen', 'is', null)
      .order('answered_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return
        // Rows are newest first, so the first row per question is the latest answer.
        const latest = new Map<string, AnswerRow>()
        for (const row of (data ?? []) as unknown as AnswerRow[]) {
          if (!latest.has(row.question_id)) latest.set(row.question_id, row)
        }
        const result = new Map<number, ChapterProgress>()
        for (const row of latest.values()) {
          if (!row.questions) continue
          const p = result.get(row.questions.chapter_id) ?? { answered: 0, correct: 0 }
          p.answered += 1
          if (row.is_correct) p.correct += 1
          result.set(row.questions.chapter_id, p)
        }
        setProgress(result)
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

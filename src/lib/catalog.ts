// The course layout: years, semesters, courses, chapters and question counts.
// Names and counts are public. Question content is never loaded here.

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { supabase, supabaseConfigured, type Profile } from './supabase.ts'

export type Category = 'past_paper' | 'quiz_midterm' | 'chapter'

// The three sections of every course, in the order they are shown.
export const SECTIONS: { category: Category; label: string }[] = [
  { category: 'past_paper', label: 'Past papers' },
  { category: 'quiz_midterm', label: 'Quizzes & midterms' },
  { category: 'chapter', label: 'Chapter questions' },
]

export type SectionCounts = Record<Category, number>

export type Semester = { id: string; year: number; number: number }

export type Chapter = {
  id: number
  course_id: string
  name: string
  position: number
  total: number
  /** Written questions (no images) per section. */
  sections: SectionCounts
  /** Practical questions: questions with images, counted apart from the sections. */
  practical: number
}

export type Course = {
  id: string
  semester_id: string
  name: string
  position: number
  total: number
  /** Written questions (no images) per section. */
  sections: SectionCounts
  /** Practical questions: questions with images, counted apart from the sections. */
  practical: number
  chapters: Chapter[]
}

/** What a student sees for a course. */
export type Access = 'unlocked' | 'locked' | 'coming-soon'

export type Catalog = {
  semesters: Semester[]
  courses: Course[]
  /** Courses an admin has unlocked for the logged-in student. */
  unlockedIds: Set<string>
}

type CatalogState = {
  loading: boolean
  error: boolean
  catalog: Catalog | null
  retry: () => void
}

type CountRow = {
  course_id: string
  chapter_id: number
  category: Category
  has_images?: boolean
  question_count: number
}

function emptySections(): SectionCounts {
  return { past_paper: 0, quiz_midterm: 0, chapter: 0 }
}

async function loadCatalog(userId: string | null): Promise<Catalog> {
  const [semesters, courses, chapters, counts, unlocks] = await Promise.all([
    supabase.from('semesters').select('id, year, number').order('year').order('number'),
    supabase.from('courses').select('id, semester_id, name, position').order('position'),
    supabase.from('chapters').select('id, course_id, name, position').order('position').order('id'),
    supabase.rpc('question_counts'),
    userId
      ? supabase.from('course_unlocks').select('course_id').eq('student_id', userId)
      : Promise.resolve({ data: [] as { course_id: string }[], error: null }),
  ])
  const firstError = semesters.error || courses.error || chapters.error || counts.error || unlocks.error
  if (firstError) throw firstError

  const courseList: Course[] = (courses.data ?? []).map((c) => ({
    ...c,
    total: 0,
    sections: emptySections(),
    practical: 0,
    chapters: [],
  }))
  const courseById = new Map(courseList.map((c) => [c.id, c]))

  const chapterById = new Map<number, Chapter>()
  for (const ch of chapters.data ?? []) {
    const chapter: Chapter = { ...ch, total: 0, sections: emptySections(), practical: 0 }
    chapterById.set(chapter.id, chapter)
    courseById.get(chapter.course_id)?.chapters.push(chapter)
  }

  for (const row of (counts.data ?? []) as CountRow[]) {
    const n = Number(row.question_count)
    for (const target of [courseById.get(row.course_id), chapterById.get(row.chapter_id)]) {
      if (!target) continue
      target.total += n
      if (row.has_images) target.practical += n
      else target.sections[row.category] += n
    }
  }

  return {
    semesters: semesters.data ?? [],
    courses: courseList,
    unlockedIds: new Set((unlocks.data ?? []).map((u) => u.course_id)),
  }
}

/** Loads the course layout, plus the logged-in student's unlocks. */
export function useCatalog(): CatalogState {
  const { loading: authLoading, profile } = useAuth()
  const userId = profile?.id ?? null
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState(!supabaseConfigured)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!supabaseConfigured || authLoading) return
    let cancelled = false
    setError(false)
    loadCatalog(userId)
      .then((result) => {
        if (!cancelled) setCatalog(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, userId, attempt])

  return {
    loading: !error && catalog === null,
    error,
    catalog,
    retry: () => setAttempt((n) => n + 1),
  }
}

/**
 * Unlocked only when the student is approved AND an admin unlocked this course.
 * Admins can open every course. A course with no questions is "coming soon".
 * (The database enforces the same rule; this only decides what to show.)
 */
export function courseAccess(course: Course, profile: Profile | null, unlockedIds: Set<string>): Access {
  if (course.total === 0) return 'coming-soon'
  if (!profile) return 'locked'
  if (profile.is_admin) return 'unlocked'
  if (profile.status === 'approved' && unlockedIds.has(course.id)) return 'unlocked'
  return 'locked'
}

export function semesterLabel(semester: Semester): string {
  return `Year ${semester.year} · Semester ${semester.number}`
}

export function questionCount(n: number): string {
  return n === 1 ? '1 question' : `${n} questions`
}

export function chapterCount(n: number): string {
  return n === 1 ? '1 chapter' : `${n} chapters`
}

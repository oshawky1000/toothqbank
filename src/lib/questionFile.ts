// Checks a question file against docs/question-format.md before it is imported.
// The database checks again when saving; this gives clear messages first.

export const CATEGORIES = ['past_paper', 'quiz_midterm', 'chapter'] as const
const ANSWER_STATUSES = ['confirmed', 'verified', 'corrected']

export type QuestionFileQuestion = {
  id: string
  course_id: string
  chapter: string
  category: (typeof CATEGORIES)[number]
}

export type QuestionFile = {
  format_version: 1
  course: { id: string; name?: string }
  questions: QuestionFileQuestion[]
}

export type CheckResult = { ok: true; file: QuestionFile } | { ok: false; errors: string[] }

const MAX_ERRORS = 50

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function checkQuestionFile(text: string): CheckResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['This is not a valid JSON file. Check that it was not cut off or edited by hand.'] }
  }

  const errors: string[] = []
  if (!isObject(data)) return { ok: false, errors: ['The file must contain one JSON object.'] }
  if (data.format_version !== 1) errors.push('format_version must be 1.')

  const course = data.course
  const courseId = isObject(course) && isText(course.id) ? course.id : null
  if (!courseId) errors.push('course.id is missing (for example "gm1").')

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push('questions must be a list with at least one question.')
    return { ok: false, errors }
  }

  const seenIds = new Set<string>()
  data.questions.forEach((q: unknown, index: number) => {
    if (errors.length >= MAX_ERRORS) return
    const where = isObject(q) && isText(q.id) ? `Question ${q.id}` : `Question number ${index + 1}`
    const fail = (field: string, message: string) => errors.push(`${where}, ${field}: ${message}`)

    if (!isObject(q)) {
      errors.push(`${where}: must be an object.`)
      return
    }

    if (!isText(q.id)) fail('id', 'missing.')
    else if (seenIds.has(q.id)) fail('id', 'used twice in this file.')
    else seenIds.add(q.id)

    if (q.course_id !== courseId) fail('course_id', `must be "${courseId ?? ''}" (the file's course.id).`)
    if (!isText(q.chapter)) fail('chapter', 'missing.')
    if (q.lecture != null && typeof q.lecture !== 'string') fail('lecture', 'must be text or null.')
    if (!CATEGORIES.includes(q.category as QuestionFileQuestion['category'])) {
      fail('category', `must be one of ${CATEGORIES.join(', ')}.`)
    }
    if (q.exam_label != null && typeof q.exam_label !== 'string') fail('exam_label', 'must be text or null.')
    if (!isText(q.stem)) fail('stem', 'missing.')

    const keys: string[] = []
    if (!Array.isArray(q.options) || q.options.length < 2) {
      fail('options', 'must be a list of at least 2 options.')
    } else {
      q.options.forEach((option: unknown, i: number) => {
        if (!isObject(option) || !isText(option.key) || !isText(option.text)) {
          fail('options', `option ${i + 1} needs a "key" and a "text".`)
        } else if (keys.includes(option.key)) {
          fail('options', `key "${option.key}" is used twice.`)
        } else {
          keys.push(option.key)
        }
      })
    }

    if (!isText(q.answer)) fail('answer', 'missing.')
    else if (keys.length > 0 && !keys.includes(q.answer)) {
      fail('answer', `"${q.answer}" is not one of the option keys (${keys.join(', ')}).`)
    }

    if (typeof q.explanation !== 'string') fail('explanation', 'must be text (can be empty).')
    if (q.answer_status != null && !ANSWER_STATUSES.includes(q.answer_status as string)) {
      fail('answer_status', `must be one of ${ANSWER_STATUSES.join(', ')}.`)
    }
    if (q.times_seen != null && !(Number.isInteger(q.times_seen) && (q.times_seen as number) >= 0)) {
      fail('times_seen', 'must be a whole number, 0 or more.')
    }
    if (q.source_pages != null && typeof q.source_pages !== 'string' && typeof q.source_pages !== 'number') {
      fail('source_pages', 'must be text.')
    }
    if (q.images != null && !(Array.isArray(q.images) && q.images.every((img) => typeof img === 'string'))) {
      fail('images', 'must be a list of file names.')
    }
  })

  if (errors.length >= MAX_ERRORS) errors.push(`Stopped after ${MAX_ERRORS} problems. Fix these first.`)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, file: data as unknown as QuestionFile }
}

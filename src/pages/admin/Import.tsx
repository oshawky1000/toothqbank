import { useRef, useState, type ChangeEvent } from 'react'
import LoadProblem from '../../components/LoadProblem.tsx'
import { SECTIONS, useCatalog, type Course } from '../../lib/catalog.ts'
import { checkQuestionFile, type QuestionFile } from '../../lib/questionFile.ts'
import { supabase } from '../../lib/supabase.ts'

type Preview = {
  file: QuestionFile
  fileName: string
  course: Course
  newCount: number
  updatedCount: number
  newChapters: string[]
  perChapter: [string, number][]
  perSection: [string, number][]
}

type Step =
  | { kind: 'choose' }
  | { kind: 'checking' }
  | { kind: 'errors'; fileName: string; errors: string[] }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'importing'; preview: Preview }
  | { kind: 'done'; message: string }

// Same clean-up the database does: trim and collapse spaces.
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')

async function buildPreview(file: QuestionFile, fileName: string, courses: Course[]): Promise<Preview | string[]> {
  const course = courses.find((c) => c.id === file.course.id)
  if (!course) return [`Course "${file.course.id}" does not exist on the site. Check course.id in the file.`]

  // Which ids already exist? Ask in groups so the request stays small.
  const ids = file.questions.map((q) => q.id.trim())
  const existing = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, course_id')
      .in('id', ids.slice(i, i + 100))
    if (error) throw error
    for (const row of data ?? []) existing.set(row.id, row.course_id)
  }

  const errors = ids
    .filter((id) => existing.has(id) && existing.get(id) !== course.id)
    .map((id) => `Question ${id}, id: already used by course "${existing.get(id)}". Ids must be unique across courses.`)
  if (errors.length > 0) return errors

  const known = new Set(course.chapters.map((ch) => ch.name.toLowerCase()))
  const newChapters: string[] = []
  const perChapter = new Map<string, number>()
  const perSection = new Map<string, number>()
  for (const q of file.questions) {
    const name = cleanName(q.chapter)
    if (!known.has(name.toLowerCase()) && !newChapters.some((n) => n.toLowerCase() === name.toLowerCase())) {
      newChapters.push(name)
    }
    perChapter.set(name, (perChapter.get(name) ?? 0) + 1)
    const label = SECTIONS.find((s) => s.category === q.category)?.label ?? q.category
    perSection.set(label, (perSection.get(label) ?? 0) + 1)
  }

  const updatedCount = ids.filter((id) => existing.has(id)).length
  return {
    file,
    fileName,
    course,
    newCount: ids.length - updatedCount,
    updatedCount,
    newChapters,
    perChapter: [...perChapter],
    perSection: [...perSection],
  }
}

export default function Import() {
  const catalog = useCatalog()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [serverError, setServerError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  if (catalog.error) return <LoadProblem what="the courses" onRetry={catalog.retry} />
  if (!catalog.catalog) return <p className="muted">Loading…</p>
  const courses = catalog.catalog.courses

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    event.target.value = '' // lets the same file be chosen again after fixing it
    if (!chosen) return
    setServerError(null)
    setStep({ kind: 'checking' })

    const checked = checkQuestionFile(await chosen.text())
    if (!checked.ok) {
      setStep({ kind: 'errors', fileName: chosen.name, errors: checked.errors })
      return
    }
    try {
      const result = await buildPreview(checked.file, chosen.name, courses)
      if (Array.isArray(result)) setStep({ kind: 'errors', fileName: chosen.name, errors: result })
      else setStep({ kind: 'preview', preview: result })
    } catch {
      setStep({ kind: 'choose' })
      setServerError('Could not check the file against the database. Check your internet connection.')
    }
  }

  async function confirmImport(preview: Preview) {
    setServerError(null)
    setStep({ kind: 'importing', preview })
    const { data, error } = await supabase.rpc('import_questions', { p_file: preview.file })
    if (error) {
      setServerError(`Nothing was imported. The database said: ${error.message}`)
      setStep({ kind: 'preview', preview })
      return
    }
    const result = data as { inserted: number; updated: number; new_chapters: string[] }
    let message = `Imported into ${preview.course.name}: ${result.inserted} new, ${result.updated} updated.`
    if (result.new_chapters.length > 0) message += ` New chapters: ${result.new_chapters.join(', ')}.`
    setStep({ kind: 'done', message })
    catalog.retry() // refresh the question counts
  }

  const chooseButton = (label: string) => (
    <button type="button" className="button button-block" onClick={() => inputRef.current?.click()}>
      {label}
    </button>
  )

  return (
    <div className="stack">
      <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={handleFile} />

      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}

      {step.kind === 'choose' && (
        <div className="card">
          <h2>Import questions</h2>
          <p className="muted">
            Choose a question file (.json). It is checked first and nothing is saved until you confirm.
            Questions with an id that already exists are updated, not duplicated.
          </p>
          {chooseButton('Choose file')}
        </div>
      )}

      {step.kind === 'checking' && <p className="muted">Checking the file…</p>}

      {step.kind === 'errors' && (
        <div className="card">
          <h2>Problems in {step.fileName}</h2>
          <p className="muted">Nothing was imported. Fix these in the file, then choose it again.</p>
          <ul className="error-list">
            {step.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {chooseButton('Choose another file')}
        </div>
      )}

      {(step.kind === 'preview' || step.kind === 'importing') && (
        <div className="card">
          <h2>Ready to import</h2>
          <p className="muted">
            {step.preview.fileName} → {step.preview.course.name}
          </p>
          <p className="import-summary">
            {step.preview.file.questions.length} questions: {step.preview.newCount} new,{' '}
            {step.preview.updatedCount} updated
          </p>
          {step.preview.newChapters.length > 0 && (
            <p>
              <strong>New chapters</strong> (added after the existing ones): {step.preview.newChapters.join(', ')}
            </p>
          )}
          <ul className="section-list">
            {step.preview.perSection.map(([label, n]) => (
              <li key={label} className="section-item">
                <span className="section-name">{label}</span>
                <span className="section-count">{n}</span>
              </li>
            ))}
          </ul>
          <details className="import-chapters">
            <summary>Questions per chapter</summary>
            <ul>
              {step.preview.perChapter.map(([name, n]) => (
                <li key={name}>
                  {name}: {n}
                </li>
              ))}
            </ul>
          </details>
          <div className="button-row">
            <button
              type="button"
              className="button grow"
              disabled={step.kind === 'importing'}
              onClick={() => confirmImport(step.preview)}
            >
              {step.kind === 'importing' ? 'Importing…' : 'Confirm import'}
            </button>
            <button
              type="button"
              className="button button-secondary grow"
              disabled={step.kind === 'importing'}
              onClick={() => setStep({ kind: 'choose' })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step.kind === 'done' && (
        <div className="card notice">
          <h2>Done</h2>
          <p>{step.message}</p>
          {chooseButton('Import another file')}
        </div>
      )}
    </div>
  )
}

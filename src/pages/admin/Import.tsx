import { useRef, useState, type ChangeEvent } from 'react'
import LoadProblem from '../../components/LoadProblem.tsx'
import { SECTIONS, useCatalog, type Course } from '../../lib/catalog.ts'
import {
  formatBytes,
  listCourseImages,
  MAX_IMAGE_BYTES,
  prepareImage,
  uploadImage,
} from '../../lib/images.ts'
import { checkQuestionFile, type QuestionFile } from '../../lib/questionFile.ts'
import { supabase } from '../../lib/supabase.ts'

type ImageUpload = { name: string; data: Blob; originalSize: number }

type Preview = {
  file: QuestionFile
  fileName: string
  course: Course
  newCount: number
  updatedCount: number
  newChapters: string[]
  perChapter: [string, number][]
  perSection: [string, number][]
  uploads: ImageUpload[]
  alreadyUploaded: string[]
  unusedFiles: string[]
}

type Step =
  | { kind: 'choose' }
  | { kind: 'checking'; message: string }
  | { kind: 'errors'; errors: string[] }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'importing'; preview: Preview; message: string }
  | { kind: 'done'; message: string }

// Same clean-up the database does: trim and collapse spaces.
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')
const isJson = (file: File) => file.name.toLowerCase().endsWith('.json')

/** Keeps one file per name; a file chosen later replaces an earlier one. */
function mergeFiles(before: File[], added: File[]): File[] {
  const byName = new Map(before.map((f) => [f.name, f]))
  for (const f of added) byName.set(f.name, f)
  return [...byName.values()]
}

async function buildPreview(
  file: QuestionFile,
  fileName: string,
  courses: Course[],
): Promise<Omit<Preview, 'uploads' | 'alreadyUploaded' | 'unusedFiles'> | string[]> {
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

type ImagePlan = { found: [string, File][]; alreadyUploaded: string[]; unusedFiles: string[]; errors: string[] }

/** Matches the images named in the file to the chosen image files and to images already on the site. */
function planImages(file: QuestionFile, imageFiles: File[], onSite: Set<string>): ImagePlan {
  // Image name -> questions that use it, in file order.
  const usedBy = new Map<string, string[]>()
  for (const q of file.questions) {
    for (const name of q.images ?? []) usedBy.set(name, [...(usedBy.get(name) ?? []), q.id.trim()])
  }

  const found: [string, File][] = []
  const alreadyUploaded: string[] = []
  const errors: string[] = []
  const matched = new Set<File>()
  for (const [name, questionIds] of usedBy) {
    // Exact name first; then ignore capital letters (phones often change .JPG to .jpg).
    const chosen =
      imageFiles.find((f) => f.name === name) ?? imageFiles.find((f) => f.name.toLowerCase() === name.toLowerCase())
    if (chosen) {
      found.push([name, chosen])
      matched.add(chosen)
    } else if (onSite.has(name)) {
      alreadyUploaded.push(name)
    } else {
      for (const id of questionIds) {
        errors.push(`Question ${id}, images: "${name}" is missing. It was not chosen and is not on the site yet.`)
      }
    }
  }
  const unusedFiles = imageFiles.filter((f) => !matched.has(f)).map((f) => f.name)
  return { found, alreadyUploaded, unusedFiles, errors }
}

export default function Import() {
  const catalog = useCatalog()
  const [files, setFiles] = useState<File[]>([])
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [serverError, setServerError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const addMode = useRef(false)

  if (catalog.error) return <LoadProblem what="the courses" onRetry={catalog.retry} />
  if (!catalog.catalog) return <p className="muted">Loading…</p>
  const courses = catalog.catalog.courses

  function openPicker(add: boolean) {
    addMode.current = add
    inputRef.current?.click()
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])]
    event.target.value = '' // lets the same files be chosen again after fixing them
    if (chosen.length === 0) return
    const list = addMode.current ? mergeFiles(files, chosen) : mergeFiles([], chosen)
    setFiles(list)
    setServerError(null)
    await check(list)
  }

  async function check(list: File[]) {
    setStep({ kind: 'checking', message: 'Checking the files…' })
    const fail = (errors: string[]) => setStep({ kind: 'errors', errors })

    const jsonFiles = list.filter(isJson)
    if (jsonFiles.length === 0) {
      return fail(['No question file (.json) was chosen. Choose the .json file together with its images.'])
    }
    if (jsonFiles.length > 1) {
      return fail([
        `Choose only one question file (.json) at a time. You chose: ${jsonFiles.map((f) => f.name).join(', ')}.`,
      ])
    }
    const jsonFile = jsonFiles[0]
    const imageFiles = list.filter((f) => !isJson(f))

    const checked = checkQuestionFile(await jsonFile.text())
    if (!checked.ok) return fail(checked.errors.map((e) => `${jsonFile.name}: ${e}`))

    try {
      const result = await buildPreview(checked.file, jsonFile.name, courses)
      if (Array.isArray(result)) return fail(result)

      const needsImages = checked.file.questions.some((q) => (q.images ?? []).length > 0)
      const onSite = needsImages ? await listCourseImages(result.course.id) : new Set<string>()
      const plan = planImages(checked.file, imageFiles, onSite)
      if (plan.errors.length > 0) return fail(plan.errors)

      const uploads: ImageUpload[] = []
      const sizeErrors: string[] = []
      for (const [name, file] of plan.found) {
        setStep({ kind: 'checking', message: `Preparing images: ${uploads.length + 1} of ${plan.found.length}…` })
        const data = await prepareImage(file)
        if (data.size > MAX_IMAGE_BYTES) {
          sizeErrors.push(`Image "${name}" is ${formatBytes(data.size)}. Images must be 5 MB or smaller.`)
        }
        uploads.push({ name, data, originalSize: file.size })
      }
      if (sizeErrors.length > 0) return fail(sizeErrors)

      setStep({
        kind: 'preview',
        preview: { ...result, uploads, alreadyUploaded: plan.alreadyUploaded, unusedFiles: plan.unusedFiles },
      })
    } catch {
      setStep({ kind: 'choose' })
      setServerError('Could not check the files against the database. Check your internet connection.')
    }
  }

  async function confirmImport(preview: Preview) {
    setServerError(null)
    const { uploads, course } = preview
    for (let i = 0; i < uploads.length; i++) {
      setStep({ kind: 'importing', preview, message: `Uploading images: ${i + 1} of ${uploads.length}…` })
      const uploadError = await uploadImage(course.id, uploads[i].name, uploads[i].data)
      if (uploadError) {
        setServerError(
          `Image "${uploads[i].name}" could not be uploaded, so no questions were imported. ` +
            `Check your internet connection and try again. (${uploadError})`,
        )
        setStep({ kind: 'preview', preview })
        return
      }
    }

    setStep({ kind: 'importing', preview, message: 'Importing questions…' })
    const { data, error } = await supabase.rpc('import_questions', { p_file: preview.file })
    if (error) {
      setServerError(`No questions were imported. The database said: ${error.message}`)
      setStep({ kind: 'preview', preview })
      return
    }
    const result = data as { inserted: number; updated: number; new_chapters: string[] }
    let message = `Imported into ${course.name}: ${result.inserted} new, ${result.updated} updated.`
    if (uploads.length > 0) message += ` ${uploads.length} image${uploads.length === 1 ? '' : 's'} uploaded.`
    if (result.new_chapters.length > 0) message += ` New chapters: ${result.new_chapters.join(', ')}.`
    setFiles([])
    setStep({ kind: 'done', message })
    catalog.retry() // refresh the question counts
  }

  const chooseButton = (label: string) => (
    <button type="button" className="button button-block" onClick={() => openPicker(false)}>
      {label}
    </button>
  )

  const imageSummary = (preview: Preview) => {
    const total = preview.uploads.length + preview.alreadyUploaded.length
    if (total === 0) return null
    const size = preview.uploads.reduce((sum, u) => sum + u.data.size, 0)
    const parts = []
    if (preview.uploads.length > 0) parts.push(`${preview.uploads.length} to upload (${formatBytes(size)})`)
    if (preview.alreadyUploaded.length > 0) parts.push(`${preview.alreadyUploaded.length} already on the site`)
    return `${total} image${total === 1 ? '' : 's'}: ${parts.join(', ')}`
  }

  return (
    <div className="stack">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".json,application/json,image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        hidden
        onChange={handleFiles}
      />

      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}

      {step.kind === 'choose' && (
        <div className="card">
          <h2>Import questions</h2>
          <p className="muted">
            Choose a question file (.json) <strong>and its images</strong> together. You can select several files at
            once. Everything is checked first and nothing is saved until you confirm. Questions with an id that already
            exists are updated, not duplicated.
          </p>
          <p className="muted small">
            Images already on the site do not need to be chosen again. Choosing an image with the same name replaces
            the old one.
          </p>
          {chooseButton('Choose files')}
        </div>
      )}

      {step.kind === 'checking' && <p className="muted">{step.message}</p>}

      {step.kind === 'errors' && (
        <div className="card">
          <h2>Problems found</h2>
          <p className="muted">Nothing was imported. Fix these, then try again.</p>
          <ul className="error-list">
            {step.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <ChosenFiles files={files} />
          <div className="stack">
            <button type="button" className="button button-block" onClick={() => openPicker(true)}>
              Add more files
            </button>
            <button type="button" className="button button-secondary button-block" onClick={() => openPicker(false)}>
              Start again with other files
            </button>
          </div>
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
          {imageSummary(step.preview) && <p className="import-summary">{imageSummary(step.preview)}</p>}
          {step.preview.newChapters.length > 0 && (
            <p>
              <strong>New chapters</strong> (added after the existing ones): {step.preview.newChapters.join(', ')}
            </p>
          )}
          {step.preview.unusedFiles.length > 0 && (
            <p className="note small">
              Not used by any question, so they will not be uploaded: {step.preview.unusedFiles.join(', ')}
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
          {step.preview.uploads.length + step.preview.alreadyUploaded.length > 0 && (
            <details className="import-chapters">
              <summary>Images</summary>
              <ul>
                {step.preview.uploads.map((u) => (
                  <li key={u.name}>
                    {u.name}: upload, {formatBytes(u.data.size)}
                    {u.data.size < u.originalSize && ` (shrunk from ${formatBytes(u.originalSize)})`}
                  </li>
                ))}
                {step.preview.alreadyUploaded.map((name) => (
                  <li key={name}>{name}: already on the site</li>
                ))}
              </ul>
            </details>
          )}
          {step.kind === 'importing' && (
            <p className="muted" role="status">
              {step.message}
            </p>
          )}
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
              onClick={() => {
                setFiles([])
                setStep({ kind: 'choose' })
              }}
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
          {chooseButton('Import more files')}
        </div>
      )}
    </div>
  )
}

function ChosenFiles({ files }: { files: File[] }) {
  if (files.length === 0) return null
  return (
    <details className="import-chapters">
      <summary>Files chosen ({files.length})</summary>
      <ul>
        {files.map((f) => (
          <li key={f.name}>{f.name}</li>
        ))}
      </ul>
    </details>
  )
}

// Question images. They live in the PRIVATE Supabase Storage bucket
// "question-images", one folder per course: <course id>/<file name>.
// The database only lets someone load an image if they can read a question
// that uses it (supabase/migrations/0005_question_images.sql), and the site
// only ever shows short-lived signed links.

import { supabase } from './supabase.ts'

export const IMAGE_BUCKET = 'question-images'

/** Same rule as public.is_valid_image_name in the database. */
export const IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}\.(jpe?g|png|webp|gif)$/i
export const IMAGE_NAME_HINT =
  'use only letters, numbers, spaces, dots, dashes, underscores and brackets, ending in .jpg, .jpeg, .png, .webp or .gif'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // the bucket refuses bigger files

export const imagePath = (courseId: string, fileName: string) => `${courseId}/${fileName}`

// ---------------------------------------------------------------------------
// Students: signed links
// ---------------------------------------------------------------------------

const LINK_SECONDS = 60 * 60
const RENEW_BEFORE_MS = 5 * 60 * 1000
// Re-using a link while it is valid lets the browser use its cached copy.
const links = new Map<string, { url: string; expires: number }>()

/**
 * Signed links for a question's images, in the same order. An entry is null
 * when the database refused it (no access, or the image is missing).
 */
export async function signImageUrls(courseId: string, names: string[], renew = false): Promise<(string | null)[]> {
  const paths = names.map((n) => imagePath(courseId, n))
  const now = Date.now()
  const toSign = [...new Set(paths)].filter((p) => {
    const link = links.get(p)
    return renew || !link || link.expires - now < RENEW_BEFORE_MS
  })

  if (toSign.length > 0) {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(toSign, LINK_SECONDS)
    if (error) throw error
    for (const p of toSign) links.delete(p)
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error) {
        links.set(row.path, { url: row.signedUrl, expires: now + LINK_SECONDS * 1000 })
      }
    }
  }
  return paths.map((p) => links.get(p)?.url ?? null)
}

// ---------------------------------------------------------------------------
// Admins: preparing and uploading images during the import
// ---------------------------------------------------------------------------

/** Images already uploaded for a course (file names). */
export async function listCourseImages(courseId: string): Promise<Set<string>> {
  const names = new Set<string>()
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .list(courseId, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    for (const item of data ?? []) names.add(item.name)
    if (!data || data.length < PAGE) return names
  }
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

function typeFromName(name: string): string | null {
  return TYPE_BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

// Phone photos are often 3–8 MB. Students load these on mobile data and the
// Supabase free plan has limited storage and traffic, so large images are
// shrunk before upload. 2000 px on the longest side keeps X-ray detail.
const MAX_SIDE = 2000
const SHRINK_ABOVE_BYTES = 1024 * 1024
const JPEG_QUALITY = 0.86

/**
 * Returns the image ready to upload: shrunk to a JPEG when it is large,
 * otherwise unchanged. GIFs are never changed (they may be animated).
 */
export async function prepareImage(file: File): Promise<Blob> {
  const type = typeFromName(file.name) ?? file.type
  const original = file.type === type ? file : new Blob([file], { type })
  if (type === 'image/gif') return original

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return original // the browser cannot read it; upload as it is
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= SHRINK_ABOVE_BYTES) {
    bitmap.close()
    return original
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return original
  }
  context.fillStyle = '#ffffff' // transparent parts of a PNG become white, not black
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const shrunk = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  return shrunk && shrunk.size < file.size ? shrunk : original
}

/** Uploads one image, replacing an older one with the same name. Returns an error message or null. */
export async function uploadImage(courseId: string, fileName: string, data: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(imagePath(courseId, fileName), data, {
    upsert: true,
    contentType: data.type || typeFromName(fileName) || 'application/octet-stream',
    cacheControl: '3600',
  })
  return error ? error.message : null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

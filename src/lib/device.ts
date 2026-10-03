// A random ID that identifies this browser. It is saved against the student's
// account on first login (one device per account).

const STORAGE_KEY = 'toothqbank-device-id'
let fallbackId: string | null = null

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    // Storage blocked (e.g. some private modes): use an ID for this visit only.
    fallbackId ??= crypto.randomUUID()
    return fallbackId
  }
}

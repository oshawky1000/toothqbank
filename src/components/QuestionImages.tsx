import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { signImageUrls } from '../lib/images.ts'

// A question's images, shown above the stem. Full width on phones; tap one to
// open it full screen, then tap again to zoom in and drag to look around.
// Links are signed for this user only after the database checks they may read
// the question (see src/lib/images.ts).

export default function QuestionImages({ courseId, images }: { courseId: string; images: string[] }) {
  const [urls, setUrls] = useState<(string | null)[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [zoomed, setZoomed] = useState<number | null>(null)
  const autoRetried = useRef(false)
  const key = images.join('\n')

  useEffect(() => {
    if (key === '') return
    let cancelled = false
    setUrls(null)
    setFailed(false)
    signImageUrls(courseId, key.split('\n'), attempt > 0)
      .then((list) => {
        if (!cancelled) setUrls(list)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, key, attempt])

  if (images.length === 0) return null

  const retry = () => setAttempt((n) => n + 1)
  // An image that fails to load usually has an expired link: get fresh links once,
  // after that show the "Try again" button.
  const onImageError = () => {
    if (autoRetried.current) {
      setFailed(true)
    } else {
      autoRetried.current = true
      retry()
    }
  }
  const label = (i: number) => (images.length === 1 ? 'Question image' : `Question image ${i + 1} of ${images.length}`)

  return (
    <div className="question-images">
      {failed || (urls && urls.some((u) => u === null)) ? (
        <div className="image-problem">
          <p>{failed ? 'The image could not load. Check your internet connection.' : 'An image is not available.'}</p>
          <button type="button" className="button button-secondary button-small" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}

      {images.map((name, i) => {
        const url = urls?.[i]
        if (url === null) return null
        return url === undefined ? (
          <div key={name} className="image-loading" aria-label="Loading image" />
        ) : (
          <ImageButton key={url} url={url} label={label(i)} onOpen={() => setZoomed(i)} onError={onImageError} />
        )
      })}

      {zoomed !== null && urls?.[zoomed] && (
        <ImageZoom url={urls[zoomed]!} label={label(zoomed)} onClose={() => setZoomed(null)} />
      )}
    </div>
  )
}

function ImageButton({
  url,
  label,
  onOpen,
  onError,
}: {
  url: string
  label: string
  onOpen: () => void
  onError: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <button type="button" className={loaded ? 'image-button' : 'image-button loading'} onClick={onOpen}>
      <img
        src={url}
        alt={label}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={onError}
      />
      <span className="image-hint" aria-hidden="true">
        Tap to zoom
      </span>
    </button>
  )
}

function ImageZoom({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const [big, setBig] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const focusPoint = useRef({ x: 0.5, y: 0.5 })

  // Close with the Escape key, and stop the page behind from scrolling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  // After zooming in, scroll so the spot that was tapped is in the middle.
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    if (!big) {
      el.scrollTo(0, 0)
      return
    }
    el.scrollLeft = focusPoint.current.x * el.scrollWidth - el.clientWidth / 2
    el.scrollTop = focusPoint.current.y * el.scrollHeight - el.clientHeight / 2
  }, [big])

  function toggle(event: MouseEvent<HTMLImageElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    focusPoint.current = {
      x: box.width ? (event.clientX - box.left) / box.width : 0.5,
      y: box.height ? (event.clientY - box.top) / box.height : 0.5,
    }
    setBig((v) => !v)
  }

  return (
    <div className="zoom" role="dialog" aria-modal="true" aria-label={label} onContextMenu={(e) => e.preventDefault()}>
      <div className="zoom-bar">
        <span className="zoom-hint">{big ? 'Drag to move · tap to fit' : 'Tap the image to zoom in'}</span>
        <button type="button" className="zoom-close" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
      <div ref={frame} className={big ? 'zoom-frame big' : 'zoom-frame'}>
        <img src={url} alt={label} draggable={false} onClick={toggle} />
      </div>
    </div>
  )
}

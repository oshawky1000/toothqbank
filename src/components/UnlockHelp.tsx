import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { config } from '../config.ts'
import ContactLink from './ContactLink.tsx'

// The "How to unlock" button on locked courses. Messages live in src/config.ts.
export default function UnlockHelp() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)

  let message: string = config.messages.unlockCourse
  if (!profile) message = config.messages.unlockSignedOut
  else if (profile.status === 'rejected' || profile.status === 'revoked') {
    message = config.messages.rejectedOrRevoked
  }

  return (
    <div className="unlock-help">
      <button
        type="button"
        className="button button-secondary button-block"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        How to unlock
      </button>
      {open && (
        <div className="note" role="status">
          <p>{message}</p>
          <ContactLink />
        </div>
      )}
    </div>
  )
}

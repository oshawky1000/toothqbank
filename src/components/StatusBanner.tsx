import { useAuth } from '../auth/AuthContext.tsx'
import { config } from '../config.ts'
import ContactLink from './ContactLink.tsx'

// Messages shown at the top of every page: forced sign-out notices and account status.
export default function StatusBanner() {
  const { profile, loadError, retry, notice, dismissNotice } = useAuth()

  if (notice) {
    return (
      <div className="banner banner-warning" role="alert">
        <p>{notice}</p>
        <div className="banner-actions">
          <ContactLink />
          <button type="button" className="link-button" onClick={dismissNotice}>
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="banner banner-warning" role="alert">
        <p>We could not load your account. Check your internet connection.</p>
        <div className="banner-actions">
          <button type="button" className="link-button" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!profile || profile.is_admin || profile.status === 'approved') return null

  const message =
    profile.status === 'pending' ? config.messages.pendingAccount : config.messages.rejectedOrRevoked

  return (
    <div className="banner" role="status">
      <p>{message}</p>
      <div className="banner-actions">
        <ContactLink />
      </div>
    </div>
  )
}

import { config } from '../config.ts'

// Shows the admin contact link from src/config.ts. Shows nothing while it is empty.
export default function ContactLink() {
  if (!config.contactLink) return null
  return (
    <a href={config.contactLink} target="_blank" rel="noreferrer" className="contact-link">
      Contact a ToothQBank admin
    </a>
  )
}

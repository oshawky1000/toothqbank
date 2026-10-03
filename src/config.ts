// Site-wide settings. Change values here; nothing else should hard-code them.

export const config = {
  siteName: 'ToothQBank',

  // Price shown on locked course cards.
  coursePrice: '100 EGP',

  // Optional contact link (for example a WhatsApp or Telegram link).
  // Leave empty to show only the messages below, with no link.
  // Do not add phone numbers anywhere else on the site.
  contactLink: '',

  // Messages shown wherever a student needs to contact us.
  messages: {
    unlockCourse: 'To unlock this course, contact a ToothQBank admin.',
    pendingAccount: 'Your account is waiting for approval. Contact a ToothQBank admin to activate it.',
    rejectedOrRevoked: 'Your account does not have access. Contact a ToothQBank admin for help.',
    forgotPassword: 'Contact a ToothQBank admin to reset your password.',
    deviceLimit: 'This account is already active on another device or browser. Contact a ToothQBank admin to switch.',
  },
} as const

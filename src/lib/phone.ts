// Turns whatever a student types into one stored format: digits only, with the
// country code and no '+'. So "01012345678", "+20 101 234 5678" and
// "00201012345678" all become "201012345678" and can only register once.
// The database checks the same rules (public.is_valid_phone).

export type PhoneResult = { ok: true; digits: string } | { ok: false; error: string }

const EGYPT_CODE = '20'
const EGYPT_MOBILE = /^1[0125]\d{8}$/ // the part after "0" or "+20", e.g. 1012345678
const INTERNATIONAL = /^[1-9]\d{7,14}$/ // country code + number, up to 15 digits

const FORMAT_HELP =
  'Enter an Egyptian mobile number like 01012345678, or an international number starting with + and the country code.'
const EGYPT_HELP = 'This is not a valid Egyptian mobile number. It should look like 01012345678.'

export function normalizePhone(input: string): PhoneResult {
  let value = input.trim().replace(/[\s\-().]/g, '')
  if (value === '') return { ok: false, error: 'Enter your phone number.' }

  if (value.startsWith('00')) value = '+' + value.slice(2)

  if (value.startsWith('+')) {
    const digits = value.slice(1)
    if (!/^\d+$/.test(digits)) return { ok: false, error: FORMAT_HELP }
    if (digits.startsWith(EGYPT_CODE)) return egyptian(digits.slice(EGYPT_CODE.length))
    if (!INTERNATIONAL.test(digits)) return { ok: false, error: FORMAT_HELP }
    return { ok: true, digits }
  }

  if (!/^\d+$/.test(value)) return { ok: false, error: FORMAT_HELP }
  if (value.startsWith('0')) return egyptian(value)
  if (value.startsWith(EGYPT_CODE) && value.length === 12) return egyptian(value.slice(EGYPT_CODE.length))
  return { ok: false, error: FORMAT_HELP }
}

function egyptian(local: string): PhoneResult {
  // People often write "+20 010..." with the extra 0.
  const number = local.startsWith('0') ? local.slice(1) : local
  if (!EGYPT_MOBILE.test(number)) return { ok: false, error: EGYPT_HELP }
  return { ok: true, digits: EGYPT_CODE + number }
}

// Students never see this. Supabase logins need an email, so we build one from the phone.
export function phoneToLoginEmail(digits: string): string {
  return `${digits}@students.toothqbank.app`
}

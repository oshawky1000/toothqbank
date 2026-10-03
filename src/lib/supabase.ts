import { createClient } from '@supabase/supabase-js'
import { getDeviceId } from './device.ts'

// Set in Cloudflare Pages > Settings > Variables and Secrets (see .env.example).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)
// Public values (they are visible in every browser anyway). Used by the security check page.
export const supabaseUrl = url ?? ''
export const supabaseAnonKey = key ?? ''

export const supabase = createClient(url || 'http://localhost', key || 'not-configured', {
  // The database only shows questions to the device bound to the account.
  global: { headers: { 'x-device-id': getDeviceId() } },
})

export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'revoked'

export type Profile = {
  id: string
  full_name: string
  phone: string
  status: AccountStatus
  is_admin: boolean
}

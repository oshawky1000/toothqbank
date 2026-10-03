import type { AuthError, Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { config } from '../config.ts'
import { getDeviceId } from '../lib/device.ts'
import { normalizePhone, phoneToLoginEmail } from '../lib/phone.ts'
import { supabase, supabaseConfigured, type Profile } from '../lib/supabase.ts'

export const PASSWORD_MIN_LENGTH = 8

type AuthContextValue = {
  /** True while we find out who is logged in and check their device. */
  loading: boolean
  profile: Profile | null
  /** Logged in, but the profile could not be loaded (usually no internet). */
  loadError: boolean
  retry: () => void
  /** A message to show after a forced sign-out (e.g. the device limit). */
  notice: string | null
  dismissNotice: () => void
  /** Each returns an error message to show, or null on success. */
  signIn: (phone: string, password: string) => Promise<string | null>
  signUp: (fullName: string, phone: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NOT_READY = 'Sign up and log in are not available yet. Please try again later.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(supabaseConfigured)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  // After every login (and every visit while logged in): check the device, then load the profile.
  useEffect(() => {
    setProfile(null)
    setLoadError(false)
    if (!userId) return

    let cancelled = false
    ;(async () => {
      const { data: deviceResult, error: deviceError } = await supabase.rpc('claim_device', {
        p_device_id: getDeviceId(),
      })
      if (cancelled) return
      if (deviceError) {
        setLoadError(true)
        return
      }
      if (deviceResult === 'blocked') {
        setNotice(config.messages.deviceLimit)
        // 'local' signs out only this browser, not the student's real device.
        await supabase.auth.signOut({ scope: 'local' })
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, status, is_admin')
        .eq('id', userId)
        .single()
      if (cancelled) return
      if (error) setLoadError(true)
      else setProfile(data as Profile)
    })()

    return () => {
      cancelled = true
    }
  }, [userId, attempt])

  const signIn = useCallback(async (phone: string, password: string) => {
    if (!supabaseConfigured) return NOT_READY
    const parsed = normalizePhone(phone)
    if (!parsed.ok) return parsed.error
    if (!password) return 'Enter your password.'

    setNotice(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToLoginEmail(parsed.digits),
      password,
    })
    return error ? authErrorMessage(error) : null
  }, [])

  const signUp = useCallback(async (fullName: string, phone: string, password: string) => {
    if (!supabaseConfigured) return NOT_READY
    const name = fullName.trim().replace(/\s+/g, ' ')
    if (name.length < 2) return 'Enter your full name.'
    if (name.length > 100) return 'Your name is too long.'
    const parsed = normalizePhone(phone)
    if (!parsed.ok) return parsed.error
    if (password.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    }

    setNotice(null)
    const { data, error } = await supabase.auth.signUp({
      email: phoneToLoginEmail(parsed.digits),
      password,
      options: { data: { full_name: name } },
    })
    if (error) return authErrorMessage(error)
    if (!data.session) {
      return 'Your account was created but cannot log in yet. Contact a ToothQBank admin.'
    }
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const value: AuthContextValue = {
    loading: sessionLoading || (userId !== null && profile === null && !loadError),
    profile,
    loadError,
    retry: () => setAttempt((n) => n + 1),
    notice,
    dismissNotice: () => setNotice(null),
    signIn,
    signUp,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Wrong phone number or password.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this phone number already exists. Log in instead.'
    case 'weak_password':
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.'
    case 'email_not_confirmed':
      return 'Your account cannot log in yet. Contact a ToothQBank admin.'
    default:
      return 'Something went wrong. Check your internet connection and try again.'
  }
}

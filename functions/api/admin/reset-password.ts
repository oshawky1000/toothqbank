// Cloudflare Pages Function: POST /api/admin/reset-password
// Lets an admin set a new password for a student. It runs on Cloudflare, not in
// the browser, because it needs the Supabase secret (service role) key, which is
// stored only as a Cloudflare secret named SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js'

type Env = {
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 72
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply(500, { error: 'Password reset is not set up yet. The Cloudflare secret is missing.' })
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return reply(401, { error: 'Please log in again.' })

  let body: { studentId?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return reply(400, { error: 'Bad request.' })
  }
  const { studentId, password } = body
  if (typeof studentId !== 'string' || !UUID.test(studentId)) {
    return reply(400, { error: 'Bad request.' })
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return reply(400, { error: `The password must be at least ${PASSWORD_MIN_LENGTH} characters.` })
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return reply(400, { error: `The password must be at most ${PASSWORD_MAX_LENGTH} characters.` })
  }

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Who is asking? They must be logged in and be an admin.
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return reply(401, { error: 'Please log in again.' })

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', caller.user.id)
    .maybeSingle()
  if (!callerProfile?.is_admin) return reply(403, { error: 'Only admins can reset passwords.' })

  // Only student passwords can be reset here.
  const { data: student } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return reply(404, { error: 'Student not found.' })
  if (student.is_admin) return reply(403, { error: 'Admin passwords cannot be reset here.' })

  const { error } = await admin.auth.admin.updateUserById(studentId, { password })
  if (error) return reply(500, { error: 'Could not set the new password. Try again.' })

  return reply(200, { ok: true })
}

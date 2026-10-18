import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerSessionClient } from '@/lib/server-supabase'
import { assertLegacyAdminAuth } from './auth/integration'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function buildAuthClient(accessToken: string) {
  assertLegacyAdminAuth()
  if (!supabaseUrl || !supabaseAnonKey) return null
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export function buildAdminClient() {
  assertLegacyAdminAuth()
  if (!supabaseUrl || !supabaseServiceRoleKey) return null
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

export async function assertAdmin(request: Request) {
  try { assertLegacyAdminAuth() }
  catch { return { error: NextResponse.json({ error: 'Legacy admin access unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) } }
  const authHeader = request.headers.get('authorization')
  const adminClient = buildAdminClient()

  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Missing Supabase env vars.' }, { status: 500 }) }
  }

  let authClient: Awaited<ReturnType<typeof createSupabaseServerSessionClient>> | ReturnType<typeof buildAuthClient> | null = null
  let accessToken: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    accessToken = authHeader.slice('Bearer '.length)
    authClient = buildAuthClient(accessToken)
  } else {
    authClient = await createSupabaseServerSessionClient()
  }

  if (!authClient) {
    return { error: NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 }) }
  }

  const { data: userData, error: userError } = await authClient.auth.getUser()
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }

  return { adminClient, authClient, accessToken, user: userData.user }
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { readAdminAuthProvider } from '@/lib/auth/integration'
import { authorizeProductRequest } from '@/lib/product-session-runtime'
import { ProductSessionError } from '@/lib/product-session-error'

export const runtime='nodejs'
export const dynamic='force-dynamic'
import { passwordChangeSchema } from '@/lib/settings-validation'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST(request: Request) {
  try {
    if (readAdminAuthProvider() === 'keycloak') {
      await authorizeProductRequest(request, true)
      return Response.json({ error: 'Manage your password through the verified Keycloak account flow.', action: 'account-console', endpoint: '/api/auth/account' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
  } catch (error) {
    return Response.json({ error: 'Password management unavailable.' }, { status: error instanceof ProductSessionError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) return Response.json({error:'Password management requires the approved Keycloak self-service flow. It is not available yet.'},{status:503,headers:{'Cache-Control':'no-store'}})
  const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid password details.' }, { status: 400 })
  if (!access.user.email) return NextResponse.json({ error: 'Your admin account does not have an email address.' }, { status: 400 })
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.json({ error: 'Password changes are temporarily unavailable.' }, { status: 503 })

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: signInError } = await verifyClient.auth.signInWithPassword({ email: access.user.email, password: parsed.data.currentPassword })
  if (signInError) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })

  const { error: updateError } = await access.adminClient.auth.admin.updateUserById(access.user.id, { password: parsed.data.newPassword })
  if (updateError) return NextResponse.json({ error: 'Unable to update the password.' }, { status: 500 })

  return NextResponse.json({ success: true, message: 'Password updated successfully. Please sign in again for a fresh session.' }, { headers: { 'Cache-Control': 'no-store' } })
  })
}

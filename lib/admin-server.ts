import { cache } from 'react'
import { createSupabaseServerSessionClient } from '@/lib/server-supabase'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import { readAdminAuthProvider } from './auth/integration'
import { resolveAdminServerSession } from './auth/admin-session'
import { authorizeProductPage } from './product-server-request'
import { ProductSessionError } from './product-session-error'

export type AdminServerSession = {
  userId: string
  email: string | null
  role: string
}

async function legacyAdminSession(): Promise<AdminServerSession | null> {
  const supabase = await createSupabaseServerSessionClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await createSupabaseAdminClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return null
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role,
  }
}

export const getAdminServerSession = cache(async (): Promise<AdminServerSession | null> => {
  try {
    return await resolveAdminServerSession({ provider: readAdminAuthProvider, authorize: authorizeProductPage, legacy: legacyAdminSession })
  } catch (error) {
    if (error instanceof ProductSessionError && [401, 403].includes(error.status)) return null
    throw new Error('Admin authentication unavailable')
  }
})

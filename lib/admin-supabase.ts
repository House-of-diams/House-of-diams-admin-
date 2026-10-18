import { createClient } from '@supabase/supabase-js'
import { assertLegacyAdminAuth } from './auth/integration'

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing ${name} environment variable for the admin app.`)
  }
  return value
}

export function createSupabaseAdminClient() {
  assertLegacyAdminAuth()
  const supabaseUrl = requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const supabaseServiceRoleKey = requireEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

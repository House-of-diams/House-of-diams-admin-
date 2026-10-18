import { createBrowserClient } from '@supabase/ssr'

function createLegacyBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables for the admin app.')
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Infer the concrete default-schema client, preserving auth callback types.
type BrowserClient = ReturnType<typeof createLegacyBrowserClient>
let client: BrowserClient | undefined
function legacyBrowserClient(): BrowserClient {
  client ??= createLegacyBrowserClient()
  return client
}

// Shared screens may retain a legacy import while selecting the AWS transport.
// Importing alone must not create auth storage, refresh timers or require legacy keys.
export const supabase: BrowserClient = new Proxy({} as BrowserClient, {
  get(_target, property) {
    const current = legacyBrowserClient()
    const value = Reflect.get(current, property, current)
    return typeof value === 'function' ? value.bind(current) : value
  },
})

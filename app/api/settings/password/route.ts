import { withOperationsRoute } from '@/lib/operations-route'
import { readAdminAuthProvider } from '@/lib/auth/integration'
import { authorizeProductRequest } from '@/lib/product-session-runtime'
import { ProductSessionError } from '@/lib/product-session-error'

export const runtime='nodejs'
export const dynamic='force-dynamic'

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
    return Response.json({error:'Password management requires the approved Keycloak self-service flow. It is not available yet.'},{status:503,headers:{'Cache-Control':'no-store'}})

  })
}

import { createAccountHandler } from '@/lib/auth/account'
import { readAdminAuthProvider } from '@/lib/auth/integration'
import { authorizeProductRequest } from '@/lib/product-session-runtime'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = createAccountHandler({ provider: readAdminAuthProvider, authorize: authorizeProductRequest, env: () => process.env })

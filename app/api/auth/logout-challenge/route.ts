import { runAuthRoute } from '@/lib/auth/runtime'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = (request: Request) => runAuthRoute('logoutChallenge', request)

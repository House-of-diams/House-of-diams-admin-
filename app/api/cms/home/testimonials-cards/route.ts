import { readCmsDataProvider } from '@/lib/cms-provider'
import { cmsErrorResponse } from '@/lib/cms-rds-handlers'
import { NextResponse } from 'next/server'

// This editor was retired with the move to RDS; the endpoint only answers 410 Gone.
function removed() {
  try { readCmsDataProvider(process.env) } catch (error) { return cmsErrorResponse(error) }
  return NextResponse.json({ error: 'This editor has been removed.' }, { status: 410 })
}
export const GET = removed
export const POST = removed
export const runtime = 'nodejs'

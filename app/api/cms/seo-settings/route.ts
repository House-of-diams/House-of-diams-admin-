import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { OperationsError } from '@/lib/db/admin-repositories/operations-shared'
import { loadSeoSettings, saveSeoSettings } from '@/lib/seo-settings-save'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async (access) => NextResponse.json(await loadSeoSettings(access.db)))
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async (access) => {
    try {
      return NextResponse.json({ ok: true, ...(await saveSeoSettings(access.db, await request.json().catch(() => null))) })
    } catch (error) {
      // Validation and stale-editor problems are the editor's to fix; anything else falls through to the shared mapping.
      if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid SEO settings.' }, { status: 400 })
      if (error instanceof OperationsError && (error.status === 409 || error.status === 404)) return NextResponse.json({ error: error.message }, { status: error.status })
      throw error
    }
  })
}

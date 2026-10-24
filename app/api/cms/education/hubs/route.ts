import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { OperationsError } from '@/lib/db/admin-repositories/operations-shared'
import { loadEducationHubs, saveEducationHub } from '@/lib/education-hubs-save'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async (access) => NextResponse.json(await loadEducationHubs(access.db)))
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async (access) => {
    try {
      return NextResponse.json({ ok: true, ...(await saveEducationHub(access.db, await request.json().catch(() => null))) })
    } catch (error) {
      // Mistakes the editor can fix are answered here; anything else goes to the shared safe mapping.
      if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid hub details.' }, { status: 400 })
      if (error instanceof OperationsError && [400, 404, 409].includes(error.status)) return NextResponse.json({ error: error.message }, { status: error.status })
      if ((error as { code?: string })?.code === '23505') return NextResponse.json({ error: 'Another hub already uses that address.' }, { status: 409 })
      throw error
    }
  })
}

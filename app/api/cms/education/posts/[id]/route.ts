import { cmsIdSchema, readCmsId } from '@/lib/cms-id-safety'
import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'

import { deleteCmsArticle, loadCmsArticle, saveCmsArticle } from '@/lib/cms-article-save'

async function readPostId(params: Promise<{ id: string }>) {
  const postId = cmsIdSchema.safeParse((await params).id)
  return postId.success ? readCmsId(postId.data) : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
  const postId = await readPostId(params)
  if (!postId) return NextResponse.json({ error: 'Invalid education id.' }, { status: 400 })
  return loadCmsArticle(access, 'education', postId)

  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
  const postId = await readPostId(params)
  if (!postId) return NextResponse.json({ error: 'Invalid education id.' }, { status: 400 })
  return saveCmsArticle(access, 'education', postId, await request.json().catch(() => null))

  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
  const postId = await readPostId(params)
  if (!postId) return NextResponse.json({ error: 'Invalid education id.' }, { status: 400 })
  return deleteCmsArticle(access, 'education', postId, await request.json().catch(() => null))

  })
}

export const runtime = 'nodejs'

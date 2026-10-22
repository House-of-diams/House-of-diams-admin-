import { handleMediaExtras } from '@/lib/product-media-extras'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleMediaExtras(request, (await params).id)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleMediaExtras(request, (await params).id)
}

export const runtime = 'nodejs'

import { runProductRdsRoute } from '@/lib/product-rds-handlers'

type DuplicateProductResult = {
  product_id: string
  slug: string
  lane: 'standard' | 'hiphop' | 'collection'
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runProductRdsRoute('duplicate', request, (await params).id)
}

export const runtime = 'nodejs'

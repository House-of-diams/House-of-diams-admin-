import { runProductRdsRoute } from '@/lib/product-rds-handlers'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runProductRdsRoute('status', request, (await params).id)
}

export const runtime = 'nodejs'

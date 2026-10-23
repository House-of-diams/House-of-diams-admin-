import { runProductRdsRoute } from '@/lib/product-rds-handlers'

export async function POST(request: Request) {
  return runProductRdsRoute('price', request)
}

export const runtime = 'nodejs'

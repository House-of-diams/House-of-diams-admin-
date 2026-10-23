import { runProductRdsRoute } from '@/lib/product-rds-handlers'

export async function GET(request: Request) {
  return runProductRdsRoute('inventory-list', request)
}

export const runtime = 'nodejs'

import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  return runCatalogRdsRoute(request, (await params).id)
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  return runCatalogRdsRoute(request, (await params).id)
}

export const runtime = 'nodejs'

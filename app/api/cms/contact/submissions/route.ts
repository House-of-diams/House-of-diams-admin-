import { NextResponse } from 'next/server'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createEnquiriesRepository } from '@/lib/db/admin-repositories/enquiries'
export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request: Request) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) {const p=new URL(request.url).searchParams;return Response.json(await createEnquiriesRepository(access.db).contactPage(Number(p.get('page')??'1'),Number(p.get('pageSize')??'25')))}
  const params = new URL(request.url).searchParams
  const page = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 25))
  const from = (page - 1) * pageSize
  const { data, error, count } = await access.adminClient.from('contact_submissions')
    .select('id, full_name, email, phone, topic, message, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, from + pageSize - 1)
  if (error) return NextResponse.json({ error: 'Unable to load contact submissions.' }, { status: 500 })
  return NextResponse.json({ items: data ?? [], page, pageSize, total: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } })
  })
}

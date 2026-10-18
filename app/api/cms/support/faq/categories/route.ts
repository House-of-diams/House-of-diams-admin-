import { categoryError } from '@/lib/cms-faq-category-error'
import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsMutation } from '@/lib/cms-command'
import { faqCategoryDeleteSchema, faqCategorySaveSchema } from '@/lib/cms-support-schemas'


export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const parsed = faqCategorySaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid FAQ category.' }, { status: 400 })
  const { data, error } = await cmsMutation(access, 'cms_save_support_faq_category_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision,
    p_id: parsed.data.id, p_item: parsed.data.item,
  })
  if (error) return categoryError(error)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function DELETE(request: Request) {
  return withCmsDataRoute(request, async access => {
  const parsed = faqCategoryDeleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Reload this FAQ category before deleting it.' }, { status: 409 })
  const { data, error } = await cmsMutation(access, 'cms_delete_support_faq_category_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision, p_id: parsed.data.id,
  })
  if (error) return categoryError(error)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'

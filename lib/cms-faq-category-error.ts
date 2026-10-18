import { NextResponse } from 'next/server'
export function categoryError(error: { code?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'FAQ categories are awaiting their database update. Existing content was not changed.' }, { status: 503 })
  if (error.code === 'P0002') return NextResponse.json({ error: 'FAQ category not found.' }, { status: 404 })
  if (error.code === '40001') return NextResponse.json({ error: 'This FAQ category changed after you opened it. Reload before continuing.' }, { status: 409 })
  if (error.code === '23503') return NextResponse.json({ error: 'Remove this category from its FAQs and document page before deleting it.' }, { status: 409 })
  if (error.code === '23505') return NextResponse.json({ error: 'An FAQ category with this name or slug already exists.' }, { status: 409 })
  if (['22023', '22P02', '23502', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The FAQ category contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to update the FAQ category. No partial changes were committed.' }, { status: 500 })
}


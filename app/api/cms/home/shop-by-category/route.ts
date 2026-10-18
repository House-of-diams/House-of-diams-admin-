import { cmsIdSchema } from '@/lib/cms-id-safety'
import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { readCmsReference } from '@/lib/cms-reference-data'
import { readHomeGroup1Envelope, saveHomeGroup1 } from '@/lib/cms-home-group1-save'

type Kind = 'category' | 'subcategory' | 'option'
type ItemInput = { id?: number | string; item_type: Kind; category_id: string | null; subcategory_id: string | null; option_id: string | null; display_order: number; is_active: boolean }

function validateItem(value: unknown): value is ItemInput {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ItemInput>
  if (typeof item.id !== 'undefined' && !cmsIdSchema.safeParse(item.id).success) return false
  if (!['category', 'subcategory', 'option'].includes(item.item_type ?? '')) return false
  const ids = [item.category_id, item.subcategory_id, item.option_id].filter((id) => typeof id === 'string' && id.length > 0)
  if (ids.length !== 1 || typeof item.is_active !== 'boolean') return false
  return (item.item_type === 'category' && !!item.category_id) || (item.item_type === 'subcategory' && !!item.subcategory_id) || (item.item_type === 'option' && !!item.option_id)
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const body = await request.json().catch(() => null)
  const section = body?.section
  const items: unknown[] = body?.items
  if (!section || typeof section.heading !== 'string' || typeof section.is_enabled !== 'boolean' || !Array.isArray(items) || !items.every(validateItem)) return NextResponse.json({ error: 'Invalid section payload.' }, { status: 400 })
  const columns = { desktop_columns: Number(section.desktop_columns), tablet_columns: Number(section.tablet_columns), mobile_columns: Number(section.mobile_columns) }
  if (columns.desktop_columns < 2 || columns.desktop_columns > 8 || columns.tablet_columns < 1 || columns.tablet_columns > 6 || columns.mobile_columns < 1 || columns.mobile_columns > 3) return NextResponse.json({ error: 'Column counts are outside the allowed range.' }, { status: 400 })
  const normalized = (items as ItemInput[]).map((item, index) => ({ ...item, display_order: index }))
  const keys = normalized.map((item) => `${item.item_type}:${item.category_id ?? item.subcategory_id ?? item.option_id}`)
  if (new Set(keys).size !== keys.length) return NextResponse.json({ error: 'The same catalog item cannot be selected twice.' }, { status: 409 })

  const db = cmsReader(access)
  const idsByKind = (kind: Kind) => normalized.filter((x) => x.item_type === kind).map((x) => (kind === 'category' ? x.category_id : kind === 'subcategory' ? x.subcategory_id : x.option_id) as string)
  const [categories, subcategories, options] = await Promise.all([
    idsByKind('category').length ? readCmsReference(db, 'categories').then(result => ({...result, data: result.data.filter(row => idsByKind('category').includes(row.id))})) : Promise.resolve({ data: [], error: null }),
    idsByKind('subcategory').length ? readCmsReference(db, 'subcategories').then(result => ({...result, data: result.data.filter(row => idsByKind('subcategory').includes(row.id))})) : Promise.resolve({ data: [], error: null }),
    idsByKind('option').length ? readCmsReference(db, 'options').then(result => ({...result, data: result.data.filter(row => idsByKind('option').includes(row.id))})) : Promise.resolve({ data: [], error: null }),
  ])
  if (categories.error || subcategories.error || options.error) return NextResponse.json({ error: 'Unable to validate the selected catalog records.' }, { status: 503 })
  const catalogRows = [...(categories.data ?? []), ...(subcategories.data ?? []), ...(options.data ?? [])]
  const found = new Set(catalogRows.map((x) => x.id))
  const missing = normalized.filter((item) => !found.has(item.category_id ?? item.subcategory_id ?? item.option_id ?? ''))
  const inactive = catalogRows.filter((item) => item.status !== 'active')
  if (missing.length) return NextResponse.json({ error: 'One or more selected catalog records no longer exist. Refresh the editor and try again.' }, { status: 400 })
  if (inactive.length) return NextResponse.json({ error: `Remove inactive catalog items before saving: ${inactive.map((item) => item.name).join(', ')}.` }, { status: 400 })

  const envelope = readHomeGroup1Envelope(body)
  if (!envelope) return NextResponse.json({ error: 'This editor is out of date. Reload it before saving.' }, { status: 409 })
  const settings = { heading: section.heading.trim() || 'Shop By Category', shop_all_label: String(section.shop_all_label ?? '').trim(), shop_all_link: String(section.shop_all_link ?? '').trim(), is_enabled: section.is_enabled, ...columns }
  const safeItems = normalized.map(({ id, item_type, category_id, subcategory_id, option_id, is_active }) => ({
    ...(id ? { id } : {}), item_type, category_id, subcategory_id, option_id, is_active,
  }))
  return saveHomeGroup1(access, 'shop_by_category', envelope, settings, safeItems)

  })
}

export const runtime = 'nodejs'

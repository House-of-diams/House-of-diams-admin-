import { sanitizeCmsHtml } from './cms-html'
import { NextResponse } from 'next/server'
import { cmsMutation, readCms, cmsReader, type CmsAccess } from './cms-command'
import { createBlogSlug } from './blog-slug'
import { createEducationSlug } from './education-slug'
import { articleDeleteSchema, articleSaveSchema } from './cms-article-schemas'
export { articleDeleteSchema, articleSaveSchema } from './cms-article-schemas'

export type CmsArticleKind = 'blog' | 'education'
type Access = CmsAccess

export type ArticleSnapshot = {
  post: Record<string, unknown>
  tags: Array<Record<string, unknown>>
  products: Array<{ id: number | string; product_id: string; sort_order: number }>
  content_blocks: Array<Record<string, unknown>>
  revision: string
}

export function articleError(error: { code?: string; message?: string }, action: 'load' | 'save' | 'delete') {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return NextResponse.json({ error: 'This CMS section is awaiting its database update. Existing content was not changed.' }, { status: 503 })
  }
  if (error.code === 'P0002') return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
  if (error.code === '40001') return NextResponse.json({ error: 'This article changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (['22023', '22P02', '23503', '23505', '23514'].includes(error.code ?? '')) {
    return NextResponse.json({ error: 'The article contains invalid or conflicting data.' }, { status: 400 })
  }
  return NextResponse.json({ error: `Unable to ${action} this article. No partial changes were committed.` }, { status: 500 })
}

export async function enrichArticleSnapshot(access: Access, snapshot: ArticleSnapshot) {
  const productIds = snapshot.products.map((item) => item.product_id)
  let productsById = new Map<string, Record<string, unknown>>()
  if (productIds.length) {
    const { data, error } = 'provider' in access
      ? { data: (await access.db.query<{ item: Record<string, unknown> }>("SELECT to_jsonb(p) AS item FROM (SELECT id,slug,name,base_price,status FROM public.products WHERE id=ANY($1::uuid[])) p", [productIds])).rows.map(row => row.item), error: null }
      : await access.adminClient.from('products').select('id, slug, name, base_price, status').in('id', productIds)
    if (error) throw new Error('Unable to load linked products.')
    productsById = new Map((data ?? []).map((product) => [String(product.id), product]))
  }
  return {
    ...snapshot,
    products: snapshot.products.map((relation) => ({
      ...relation,
      product: productsById.get(relation.product_id) ?? null,
    })),
  }
}

export async function loadCmsArticle(access: Access, kind: CmsArticleKind, postId: number | string) {
  const { data, error } = await readCms(cmsReader(access), 'cms_article_snapshot_v1', { p_kind: kind, p_post_id: postId })
  if (error) return articleError(error, 'load')
  try {
    return NextResponse.json(await enrichArticleSnapshot(access, data as ArticleSnapshot), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if ('provider' in access) throw error
    return NextResponse.json({ error: 'Unable to load linked products.' }, { status: 500 })
  }
}

export async function saveCmsArticle(access: Access, kind: CmsArticleKind, postId: number | string | null, input: unknown) {
  const parsed = articleSaveSchema.safeParse(input)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid article payload.' }, { status: 400 })
  }
  if (postId === null && parsed.data.expected_revision) {
    return NextResponse.json({ error: 'A new article cannot use an existing revision.' }, { status: 400 })
  }
  if (postId !== null && !parsed.data.expected_revision) {
    return NextResponse.json({ error: 'This editor is out of date. Reload it before saving.' }, { status: 409 })
  }

  const slugBase = kind === 'blog' ? createBlogSlug(parsed.data.post.title) : createEducationSlug(parsed.data.post.title)
  const post = {
    ...parsed.data.post,
    slug_base: slugBase,
    title_html: sanitizeCmsHtml(parsed.data.post.title_html.trim() || parsed.data.post.title),
    body_html: sanitizeCmsHtml(parsed.data.post.body_html),
    catalog_category_id: kind === 'blog' ? parsed.data.post.catalog_category_id || null : null,
  }
  const { data, error } = await cmsMutation(access, 'cms_save_article_v1', {
    p_request_id: parsed.data.request_id,
    p_kind: kind,
    p_post_id: postId,
    p_expected_revision: parsed.data.expected_revision ?? null,
    p_post: post,
    p_tags: parsed.data.tags,
    p_products: parsed.data.products,
    p_blocks: parsed.data.content_blocks.map(block => ({...block,body_html:sanitizeCmsHtml(block.body_html),heading:sanitizeCmsHtml(block.heading)})),
    p_deleted_tag_ids: parsed.data.deleted_tag_ids,
    p_deleted_product_ids: parsed.data.deleted_product_ids,
    p_deleted_block_ids: parsed.data.deleted_block_ids,
  })
  if (error) return articleError(error, 'save')
  try {
    const result = await enrichArticleSnapshot(access, data as ArticleSnapshot)
    return NextResponse.json({ ok: true, ...result, id: result.post.id, slug: result.post.slug }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if ('provider' in access) throw error
    return NextResponse.json({ error: 'The article was saved, but its linked product details could not be reloaded.' }, { status: 500 })
  }
}

export async function deleteCmsArticle(access: Access, kind: CmsArticleKind, postId: number | string, input: unknown) {
  const parsed = articleDeleteSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: 'Reload this editor before deleting.' }, { status: 409 })
  const { data, error } = await cmsMutation(access, 'cms_delete_article_v1', {
    p_request_id: parsed.data.request_id,
    p_kind: kind,
    p_post_id: postId,
    p_expected_revision: parsed.data.expected_revision,
  })
  if (error) return articleError(error, 'delete')
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

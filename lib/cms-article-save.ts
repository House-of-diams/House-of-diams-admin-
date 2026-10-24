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
    const { data, error } = { data: (await access.db.query<{ item: Record<string, unknown> }>("SELECT to_jsonb(p) AS item FROM (SELECT id,slug,name,base_price,status FROM public.products WHERE id=ANY($1::uuid[])) p", [productIds])).rows.map(row => row.item), error: null }
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

  const { seo_title: seoTitle, seo_description: seoDescription, seo_indexable: seoIndexable, ...articlePost } = parsed.data.post
  const slugBase = kind === 'blog' ? createBlogSlug(articlePost.title) : createEducationSlug(articlePost.title)
  const post = {
    ...articlePost,
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
  // Same transaction as the article save; the snapshot is re-read so its revision includes the SEO fields.
  const saved = await saveArticleSeo(access, kind, (data as ArticleSnapshot).post.id as number | string, {
    seo_title: seoTitle ?? null, seo_description: seoDescription ?? null, seo_indexable: seoIndexable ?? null,
  })
  try {
    const result = await enrichArticleSnapshot(access, saved)
    return NextResponse.json({ ok: true, ...result, id: result.post.id, slug: result.post.slug }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if ('provider' in access) throw error
    return NextResponse.json({ error: 'The article was saved, but its linked product details could not be reloaded.' }, { status: 500 })
  }
}

async function saveArticleSeo(
  access: Access,
  kind: CmsArticleKind,
  postId: number | string,
  // null = not sent by the editor (keep the stored value); '' = cleared.
  seo: { seo_title: string | null; seo_description: string | null; seo_indexable: boolean | null },
): Promise<ArticleSnapshot> {
  const table = kind === 'blog' ? 'blog_posts' : 'education_posts'
  // published_at records the first time an article goes live, for search engines' "published" date.
  await access.db.query(
    `UPDATE public.${table}
        SET seo_title = CASE WHEN $1::text IS NULL THEN seo_title ELSE NULLIF($1::text, '') END,
            seo_description = CASE WHEN $2::text IS NULL THEN seo_description ELSE NULLIF($2::text, '') END,
            seo_indexable = COALESCE($3::boolean, seo_indexable),
            published_at = CASE WHEN is_published AND published_at IS NULL THEN now() ELSE published_at END
      WHERE id = $4::bigint`,
    [seo.seo_title, seo.seo_description, seo.seo_indexable, String(postId)],
  )
  const { data } = await readCms(cmsReader(access), 'cms_article_snapshot_v1', { p_kind: kind, p_post_id: postId })
  return data as ArticleSnapshot
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

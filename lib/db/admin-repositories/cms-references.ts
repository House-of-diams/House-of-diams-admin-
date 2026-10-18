import 'server-only'
import { assertSafeCmsIds, parseCmsJson } from '../../cms-id-safety'
import type { CatalogCategory, CatalogSubcategory, CatalogOption, ProductRecord } from '../../product-catalog'
import type { BlogListItem } from '@/app/dashboard/cms/blog/blog-list-client'
import type { EducationListItem } from '@/app/dashboard/cms/education/education-list-client'
import type { DbExecutor } from '../query'
export type CmsReferenceResults = {
  categories: CatalogCategory[]
  activeCategories: Array<{ id: string; name: string; slug: string }>
  subcategories: CatalogSubcategory[]
  options: CatalogOption[]
  shapes: Array<{ id: string; name: string; slug: string }>
  products: ProductRecord[]
  coupons: Array<{id:number;code:string;title:string;is_active:boolean;usage_limit:number|null;usage_count:number|null}>
  blog: BlogListItem[]
  education: EducationListItem[]
  faqCategories: Array<{id:number;name:string;slug:string;image_path:string|null;image_alt:string;is_active:boolean}>
}
export const cmsReferenceSql = {
  "categories": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT * FROM public.catalog_categories ORDER BY display_order) r",
  "activeCategories": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT id,name,slug FROM public.catalog_categories WHERE status='active' ORDER BY display_order) r",
  "subcategories": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT * FROM public.catalog_subcategories ORDER BY display_order) r",
  "options": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT * FROM public.catalog_options ORDER BY display_order) r",
  "shapes": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT id,name,slug FROM public.catalog_stone_shapes WHERE status='active' ORDER BY display_order) r",
  "products": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT * FROM public.products ORDER BY created_at DESC) r",
  "coupons": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT id,code,title,is_active,usage_limit,usage_count FROM public.coupons WHERE is_active=true ORDER BY created_at DESC) r",
  "blog": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT id,slug,title,category,catalog_category_id,author,date_label,read_time,is_published,sort_order,updated_at FROM public.blog_posts ORDER BY sort_order) r",
  "education": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT id,slug,title,category,author,date_label,read_time,is_published,sort_order,updated_at FROM public.education_posts ORDER BY sort_order) r",
  "faqCategories": "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS result FROM (SELECT id,name,slug,image_path,image_alt,is_active FROM public.support_faq_categories ORDER BY sort_order) r"
} as const
export function createCmsReferenceRepository(db: DbExecutor) {
  return { async read<K extends keyof CmsReferenceResults>(name: K): Promise<CmsReferenceResults[K]> {
    const sql = cmsReferenceSql[name]
    if (!sql) throw new Error('Unsupported CMS reference')
    const { rows } = await db.query<{result: CmsReferenceResults[K]}>(`WITH snapshot AS MATERIALIZED (${sql}) SELECT result::text AS result FROM snapshot`)
    const result = parseCmsJson(rows[0]?.result)
    if (rows.length !== 1 || !Array.isArray(result)) throw new Error('Invalid CMS references')
    assertSafeCmsIds(result)
    return result as CmsReferenceResults[K]
  } }
}

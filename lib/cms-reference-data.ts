import 'server-only'
import type { CmsReader } from './cms-command'
import type { CmsReferenceResults } from './db/admin-repositories/cms-references'
import type { createSupabaseAdminClient } from './admin-supabase'
export async function readCmsReference<K extends keyof CmsReferenceResults>(reader: CmsReader, name: K): Promise<{data: CmsReferenceResults[K]; error: {message: string} | null}> {
  if ('execute' in reader) return { data: await reader.references.read(name), error: null }
  const client = reader as ReturnType<typeof createSupabaseAdminClient>
  const queries = {
    categories: () => client.from('catalog_categories').select('*').order('display_order'),
    activeCategories: () => client.from('catalog_categories').select('id,name,slug').eq('status','active').order('display_order'),
    subcategories: () => client.from('catalog_subcategories').select('*').order('display_order'),
    options: () => client.from('catalog_options').select('*').order('display_order'),
    shapes: () => client.from('catalog_stone_shapes').select('id,name,slug').eq('status','active').order('display_order'),
    products: () => client.from('products').select('*').order('created_at',{ascending:false}),
    coupons: () => client.from('coupons').select('id,code,title,is_active,usage_limit,usage_count').eq('is_active',true).order('created_at',{ascending:false}),
    blog: () => client.from('blog_posts').select('id,slug,title,category,catalog_category_id,author,date_label,read_time,is_published,sort_order,updated_at').order('sort_order'),
    education: () => client.from('education_posts').select('id,slug,title,category,author,date_label,read_time,is_published,sort_order,updated_at').order('sort_order'),
    faqCategories: () => client.from('support_faq_categories').select('id,name,slug,image_path,image_alt,is_active').order('sort_order'),
  }
  const result = await queries[name]()
  return { data: (result.data ?? []) as CmsReferenceResults[K], error: result.error }
}

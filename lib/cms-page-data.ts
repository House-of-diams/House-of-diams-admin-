import { readCmsId } from '@/lib/cms-id-safety'
import 'server-only'
import { readCmsDataProvider } from './cms-provider'
import { authorizeProductPage } from './product-server-request'
import { adminQuery } from './db/pool'
import { createCmsRepository } from './db/admin-repositories/cms'
import type { CmsReader } from './cms-command'
export async function cmsPageReader(): Promise<CmsReader> {
  readCmsDataProvider(process.env)
  await authorizeProductPage()
  return createCmsRepository({ query: async (sql, values) => ({ rows: await adminQuery(sql, values) }) })
}
export async function authorizeCmsPage() {
  readCmsDataProvider(process.env)
  await authorizeProductPage()
}

export async function loadRdsBespokePageData() {
  readCmsDataProvider(process.env)
  await authorizeProductPage()
  const { adminTransaction } = await import('./db/pool')
  const { createBespokeRepository } = await import('./db/admin-repositories/bespoke')
  const { loadBespokeHeroSnapshot } = await import('./bespoke-hero-save')
  const { loadBespokeFormSnapshot } = await import('./bespoke-form-save')
  const { loadCmsContentListSnapshot } = await import('./cms-content-list-save')
  return adminTransaction(async db => {
    const cms = createCmsRepository(db), bespoke = createBespokeRepository(db)
    const [hero,form,process,categories,items,submissions] = await Promise.all([
      loadBespokeHeroSnapshot(cms),loadBespokeFormSnapshot(cms),loadCmsContentListSnapshot(cms,'bespoke_process'),
      bespoke.list('category'),bespoke.list('item'),bespoke.submissions({},false),
    ])
    return {
      hero:{...(hero.item??{heading_line_1:'',slider_enabled:false,status:'active' as const}),items:hero.items},
      heroRevision:hero.revision,formConfig:form,categories,items,submissions,processRevision:process.revision,
      processItems:process.items.map(item=>({id:readCmsId(item.id),sort_order:Number(item.sort_order),eyebrow:String(item.eyebrow??''),title:String(item.title??''),description:String(item.description??'')})),
    }
  })
}
export async function loadRdsBespokeSubmission(id: string) {
  readCmsDataProvider(process.env)
  await authorizeProductPage()
  const { createBespokeRepository } = await import('./db/admin-repositories/bespoke')
  return {item:await createBespokeRepository({query:async(sql,values)=>({rows:await adminQuery(sql,values)})}).submission(id)}
}

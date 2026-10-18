import { readCms } from '@/lib/cms-command'
import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { readCmsReference } from '@/lib/cms-reference-data'
import { loadCmsRelationalSnapshot, saveCmsRelational } from '@/lib/cms-relational-save'
export async function GET(request:Request){
  return withCmsDataRoute(request, async access => {try{const [x,categories,catalog]=await Promise.all([loadCmsRelationalSnapshot(cmsReader(access),'faq'),readCms(cmsReader(access), 'cms_support_faq_categories_v1', {}),readCmsReference(cmsReader(access), 'activeCategories')]);if(categories.error||catalog.error)throw new Error('Unable to load FAQ categories.');return NextResponse.json({section:x.parent??{section_key:'global_support_faq',title:'Frequently Asked Questions',subtitle:''},items:x.items,categories:categories.data??[],catalogCategories:catalog.data??[],revision:x.revision},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Unable to load this section.'},{status:500})}
  })
}
export async function POST(request:Request){
  return withCmsDataRoute(request, async access => {return saveCmsRelational(access,'faq',await request.json().catch(()=>null))
  })
}


export const runtime = 'nodejs'

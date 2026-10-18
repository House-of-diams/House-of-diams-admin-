import { resolveStoredImage } from '@/lib/image-reference'
import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'

import { loadCmsRelationalSnapshot, saveCmsRelational } from '@/lib/cms-relational-save'
export async function GET(request:Request){
  return withCmsDataRoute(request, async access => {try{const x=await loadCmsRelationalSnapshot(cmsReader(access),'service_banner');const path=x.parent?.image_path;const image_url=typeof path==='string'?resolveStoredImage(path,process.env.SUPABASE_COLLECTION_BUCKET??'hod')??'':'';return NextResponse.json({section:{...(x.parent??{image_path:'',image_alt:'',is_enabled:true}),image_url},blocks:x.items,revision:x.revision},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Unable to load the Service Banner.'},{status:503})}
  })
}
export async function POST(request:Request){
  return withCmsDataRoute(request, async access => {return saveCmsRelational(access,'service_banner',await request.json().catch(()=>null))
  })
}

export const runtime = 'nodejs'

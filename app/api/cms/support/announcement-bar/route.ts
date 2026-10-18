import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadCmsRelationalSnapshot, saveCmsRelational } from '@/lib/cms-relational-save'
export async function GET(request:Request){
  return withCmsDataRoute(request, async access => {try{const x=await loadCmsRelationalSnapshot(cmsReader(access),'announcement');return NextResponse.json({section:x.parent??{section_key:'global_support_announcement_bar',is_active:true,autoplay:true,speed_ms:3000},items:x.items,revision:x.revision},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Unable to load the Announcement Bar.'},{status:503})}
  })
}
export async function POST(request:Request){
  return withCmsDataRoute(request, async access => {return saveCmsRelational(access,'announcement',await request.json().catch(()=>null))
  })
}

export const runtime = 'nodejs'

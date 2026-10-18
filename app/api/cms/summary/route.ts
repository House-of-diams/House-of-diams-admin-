import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadCmsRelationalSnapshot, saveCmsRelational } from '@/lib/cms-relational-save'
export async function GET(request:Request){
  return withCmsDataRoute(request, async access => {try{const x=await loadCmsRelationalSnapshot(cmsReader(access),'summary');return NextResponse.json({section:x.parent,pointers:x.items,revision:x.revision},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Unable to load Summary content.'},{status:503})}
  })
}
export async function POST(request:Request){
  return withCmsDataRoute(request, async access => {return saveCmsRelational(access,'summary',await request.json().catch(()=>null))
  })
}

export const runtime = 'nodejs'

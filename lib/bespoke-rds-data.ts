import 'server-only'
import { z } from 'zod'
import type { CmsRdsAccess } from './cms-command'
import { createBespokeRepository } from './db/admin-repositories/bespoke'
import { bespokeSubmissionQuerySchema } from './admin-read-validation'
import { portfolioCategoryCreateSchema,portfolioCategoryUpdateSchema,portfolioItemCreateSchema,portfolioItemUpdateSchema,portfolioExpectedTimestampSchema,portfolioIdSchema } from './bespoke-portfolio-validation'
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function runBespokeData(request:Request,access:CmsRdsAccess,rawId?:string) {
  const repo=createBespokeRepository(access.db)
  const resource=new URL(request.url).pathname.split('/')[3]
  if(resource==='submissions') {
    if(request.method!=='GET')return reply({error:'Method not allowed.'},405)
    if(rawId){const id=z.string().uuid().safeParse(rawId);if(!id.success)return reply({error:'Invalid submission ID.'},400);const item=await repo.submission(id.data);return item?reply({item}):reply({error:'Submission not found.'},404)}
    const params=new URL(request.url).searchParams
    const filters=bespokeSubmissionQuerySchema.safeParse({from:params.get('from')??undefined,to:params.get('to')??undefined,q:params.get('q')??undefined})
    return filters.success?reply({items:await repo.submissions(filters.data)}):reply({error:filters.error.issues[0]?.message??'Invalid submission filters.'},400)
  }
  const kind=resource==='portfolio-categories'?'category':resource==='portfolio-items'?'item':null
  if(!kind)return reply({error:'Unsupported Bespoke operation.'},400)
  if(request.method==='GET')return reply({items:await repo.list(kind)})
  const id=rawId?portfolioIdSchema.safeParse(rawId):null
  if(id&&!id.success)return reply({error:`Invalid portfolio ${kind} ID.`},400)
  if(request.method==='DELETE'){
    if(!id?.success)return reply({error:'Invalid portfolio ID.'},400)
    const expected=portfolioExpectedTimestampSchema.safeParse(new URL(request.url).searchParams.get('expected_updated_at'))
    if(!expected.success)return reply({error:`A valid ${kind} revision is required.`},400)
    if(await repo.remove(kind,id.data,expected.data))return reply({ok:true})
    const exists=await repo.exists(kind,id.data)
    return reply({error:exists?`This ${kind} was changed by another administrator. Reload it before deleting.`:`Portfolio ${kind} not found.`},exists?409:404)
  }
  if(!['POST','PATCH'].includes(request.method))return reply({error:'Method not allowed.'},405)
  const input=await request.json().catch(()=>null)
  const schema=kind==='category'?(rawId?portfolioCategoryUpdateSchema:portfolioCategoryCreateSchema):(rawId?portfolioItemUpdateSchema:portfolioItemCreateSchema)
  const parsed=schema.safeParse(input)
  if(!parsed.success)return reply({error:parsed.error.issues[0]?.message??'Invalid portfolio details.'},400)
  const expected = 'expected_updated_at' in parsed.data ? String(parsed.data.expected_updated_at) : undefined
  const targetId = id?.success ? id.data : undefined
  let item
  if (kind === 'category') {
    const clean = portfolioCategoryCreateSchema.parse(input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expected_updated_at')) : input)
    item = await repo.save('category',clean,targetId,expected)
  } else {
    const clean = portfolioItemCreateSchema.parse(input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expected_updated_at')) : input)
    if (!await repo.exists('category',clean.category_id)) return reply({error:'The selected portfolio category was not found.'},404)
    item = await repo.save('item',clean,targetId,expected)
  }
  if(item)return reply({item},rawId?200:201)
  const exists=await repo.exists(kind,targetId!)
  return reply({error:exists?`This ${kind} was changed by another administrator. Reload it before saving.`:`Portfolio ${kind} not found.`},exists?409:404)
}

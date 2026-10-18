import { z } from 'zod'
const maxId = BigInt('9223372036854775807')
export const cmsIdSchema = z.union([z.number().int().safe().positive(), z.string().regex(/^[1-9][0-9]*$/).refine(value => /^[1-9][0-9]*$/.test(value) && BigInt(value) <= maxId, 'Invalid CMS identifier')])
export function readCmsId(value: unknown): number | string {
  const id = cmsIdSchema.parse(value)
  return typeof id === 'string' && BigInt(id) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : id
}
export function compareCmsIds(a: number | string, b: number | string) { const x=BigInt(a),y=BigInt(b);return x<y?-1:x>y?1:0 }
/** Keep bigint IDs exact before pg's JSON parser can round them. String tokens are never rewritten. */
export function parseCmsJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  let previous='',key='',offset=0,result=''
  const tokens=/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[:,{}\[\]]/g
  for (const match of value.matchAll(tokens)) {
    const token=match[0],index=match.index!
    let next=token
    if(previous===':' && (key==='id'||key.endsWith('_id')) && /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) next=JSON.stringify(token)
    result+=value.slice(offset,index)+next;offset=index+token.length
    if(token.startsWith('"'))key=JSON.parse(token)
    previous=token
  }
  return JSON.parse(result+value.slice(offset))
}
export function assertSafeCmsIds(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertSafeCmsIds); return }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'id' || key.endsWith('_id')) && typeof child === 'number' && !Number.isSafeInteger(child)) throw new Error('Unsafe CMS identifier')
    assertSafeCmsIds(child)
  }
}

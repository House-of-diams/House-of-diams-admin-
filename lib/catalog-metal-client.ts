type Part={id?:number|string}
export function catalogMetalSaveBody(metal:Record<string,unknown>,parts:Part[],expectedRevision:string|null,originalParts:Part[]=[]){const retained=new Set(parts.flatMap(x=>x.id?[x.id]:[]));return JSON.stringify({request_id:crypto.randomUUID(),expected_revision:expectedRevision,metal,parts,deleted_part_ids:originalParts.flatMap(x=>x.id&&!retained.has(x.id)?[x.id]:[])})}
export function catalogMetalDeleteBody(expectedRevision:string){return JSON.stringify({request_id:crypto.randomUUID(),expected_revision:expectedRevision})}

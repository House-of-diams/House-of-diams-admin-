import fs from 'node:fs'
import {createHash} from 'node:crypto'
// Historical D1e extraction missed INSERT ... AS target (...) and its upsert.
// Keep historical evidence intact; reconcile these exact, hash-pinned sources here.
export function contentWriteRequirements(manifest){
 const result=structuredClone(manifest)
 const corrections=[
  {name:'public.certifications_section',routine:'cms_save_home_group1_v1',
   insert:['section_key','eyebrow','heading'],update:['eyebrow','heading']},
  {name:'public.home_instagram_reels_section',routine:'cms_save_reels_v1',
   insert:['section_key','heading','subtitle','is_enabled','marquee_duration_seconds','pause_on_hover'],
   update:['heading','subtitle','is_enabled','marquee_duration_seconds','pause_on_hover']},
 ]
 for(const c of corrections){
  const row=result.relations.find(r=>r.relation===c.name)
  if(!row)throw new Error('Missing content source relation')
  row.insert=[...new Set([...row.insert,...c.insert])].sort()
  row.update=[...new Set([...row.update,...c.update])].sort()
 }
 for(const r of result.routines){
  const metadata=JSON.parse(fs.readFileSync(r.source,'utf8').replace(/^\uFEFF/,''))
  const source=metadata.functions.find(f=>f.name===r.name&&f.arguments===r.arguments)?.definition
  if(!source||createHash('sha256').update(source).digest('hex')!==r.sha256)throw new Error('Audited routine source hash differs')
  for(const match of source.matchAll(/insert\s+into\s+public\.([a-z_]+)(?:\s+as\s+[a-z_]+)?\s*\(([^)]+)\)/gi)){
   const relation=result.relations.find(t=>t.relation==='public.'+match[1])
   if(match[2].split(',').map(s=>s.trim()).some(c=>!relation?.insert.includes(c)))throw new Error('Unreconciled literal content INSERT')
  }
  for(const match of source.matchAll(/lock\s+table\s+([a-z_.,\s]+?)\s+in\s+share\s+row\s+exclusive\s+mode/gi)){
   for(const name of match[1].split(',').map(s=>s.trim())){
    const row=result.relations.find(t=>t.relation===name)
    if(!row)throw new Error('Unreconciled table lock')
    // LOCK TABLE needs a table-level UPDATE/DELETE privilege. Column UPDATE
    // is insufficient. DELETE plus a restrictive false policy permits locks
    // while forbidding row deletion, without granting table-wide UPDATE.
    if(!row.delete)row.lock_delete=true
   }
  }
 }
 return result
}

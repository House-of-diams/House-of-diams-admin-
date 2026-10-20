import 'server-only'
import type { DbExecutor } from '../query'
import { siteSettingsSchema } from '../../settings-validation'
import type { CatalogGstSlab } from '../../product-catalog'
import { jsonRows, OperationsError } from './operations-shared'
import { revisionOf, STALE_EDITOR_MESSAGE } from '../../revision'
const key='global_site_settings'
const fields=['whatsapp_number','default_gst_slab_id','maintenance_mode_enabled','maintenance_mode_message','estimated_delivery_text'] as const
type Settings={whatsapp_number:string;default_gst_slab_id:string|null;maintenance_mode_enabled:boolean;maintenance_mode_message:string;estimated_delivery_text:string}
/** HOD-054: revision over the five editable settings. */
export function settingsRevision(settings:Record<string,unknown>){return revisionOf(Object.fromEntries(fields.map(f=>[f,settings[f]??null])))}
export function createSettingsRepository(db:DbExecutor) {
  async function read() {
    const records=await jsonRows<Settings>(db,`SELECT jsonb_build_object(${fields.map(f=>`'${f}',${f}`).join(',')})::text AS item FROM public.site_settings WHERE settings_key=$1::text`,[key])
    if(records.length>1)throw new Error('Ambiguous settings')
    const data=records[0]
    return {settings_key:key,whatsapp_number:data?.whatsapp_number??'',default_gst_slab_id:data?.default_gst_slab_id??'',maintenance_mode_enabled:Boolean(data?.maintenance_mode_enabled),maintenance_mode_message:data?.maintenance_mode_message??'',estimated_delivery_text:data?.estimated_delivery_text??'Approximately 3 to 4 weeks'}
  }
  async function gst() {return jsonRows<CatalogGstSlab>(db,'SELECT to_jsonb(g)::text AS item FROM public.catalog_gst_slabs g ORDER BY display_order,id')}
  /** expectedRevision: the HTTP route always passes one (missing header = ''); internal callers may omit it. */
  async function save(raw:unknown,expectedRevision?:string|null) {
    const input=siteSettingsSchema.parse(raw)
    if(input.default_gst_slab_id){
      const {rows}=await db.query('SELECT id FROM public.catalog_gst_slabs WHERE id=$1::uuid AND status::text <> \'hidden\' FOR SHARE',[input.default_gst_slab_id])
      if(rows.length!==1)throw new OperationsError(400,'Select an active GST slab.')
    }
    // Serialize the legacy update-or-insert contract without assuming an unverified unique constraint.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',['admin:global_site_settings'])
    if(expectedRevision!==undefined && settingsRevision(await read())!==expectedRevision)throw new OperationsError(409,STALE_EDITOR_MESSAGE)
    const payload=JSON.stringify(input)
    const projection=fields.map(f=>`(jsonb_populate_record(NULL::public.site_settings,$2::jsonb)).${f}`).join(',')
    const result=await db.query(`UPDATE public.site_settings SET (${fields.join(',')})=(${projection}) WHERE settings_key=$1::text RETURNING settings_key`,[key,payload])
    if(result.rows.length>1)throw new Error('Ambiguous settings')
    if(!result.rows.length)await db.query(`INSERT INTO public.site_settings (settings_key,${fields.join(',')}) SELECT $1::text,${projection}`,[key,payload])
    return expectedRevision===undefined?{success:true}:{success:true,revision:settingsRevision(await read())}
  }
  return {read,gst,save}
}

import 'server-only'
import type { DbExecutor } from '../query'
import { jsonRows } from './operations-shared'
type Product={id:string;name:string;slug:string;sku:string|null;status:string;stock_quantity:number;base_price:number;image_1_path:string|null}
type Variant={id:string;product_id:string;metal_id:string;price:number;is_default:boolean;sort_order:number}
type Metal={id:string;name:string;display_label:string|null;purity_label:string|null;base_metal_name:string|null}
type Media={variant_id:string;media_type:string;media_path:string;sort_order:number}
export async function couponProductSources(db:DbExecutor) {
  const products={data:await jsonRows<Product>(db,"SELECT to_jsonb(t)::text AS item FROM (SELECT id,name,slug,sku,status,stock_quantity,base_price,image_1_path FROM public.products WHERE status='active' ORDER BY name,id) t"),error:null}
  const variants={data:await jsonRows<Variant>(db,'SELECT to_jsonb(t)::text AS item FROM (SELECT id,product_id,metal_id,price,is_default,sort_order FROM public.product_metal_variants ORDER BY sort_order,id) t'),error:null}
  const metals={data:await jsonRows<Metal>(db,'SELECT to_jsonb(t)::text AS item FROM (SELECT id,name,display_label,purity_label,base_metal_name FROM public.catalog_metals) t'),error:null}
  const media={data:await jsonRows<Media>(db,"SELECT to_jsonb(t)::text AS item FROM (SELECT variant_id,media_type,media_path,sort_order FROM public.product_variant_media_items WHERE media_type='image' ORDER BY sort_order,id) t"),error:null}
  return {products,variants,metals,media}
}

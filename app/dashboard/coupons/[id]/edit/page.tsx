import { cmsIdSchema } from '@/lib/cms-id-safety'
import { notFound } from 'next/navigation'
import { CouponEditor } from '../../coupon-editor'
import { getCoupon, getCouponProducts } from '../../coupon-data'
export default async function EditCouponPage({ params }: { params: Promise<{ id:string }> }) { const {id}=await params; const parsed=cmsIdSchema.safeParse(id); if(!parsed.success) notFound(); const [coupon,products]=await Promise.all([getCoupon(parsed.data),getCouponProducts()]); if(!coupon) notFound(); return <CouponEditor coupon={coupon} products={products}/> }

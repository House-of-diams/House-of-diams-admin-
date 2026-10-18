import { CouponEditor } from '../coupon-editor'
import { getCouponProducts } from '../coupon-data'
export default async function NewCouponPage() { return <CouponEditor products={await getCouponProducts()}/> }

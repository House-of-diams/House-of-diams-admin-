import { CouponsClient } from './coupons-client'
import { getCoupons } from './coupon-data'

export default async function CouponsPage() {
  return <CouponsClient initialItems={await getCoupons()} />
}

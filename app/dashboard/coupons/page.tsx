import { CouponsClient } from './coupons-client'
import { getCoupons } from './coupon-data'
import { pageParam, queryParam } from '@/lib/page-param'

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[]; q?: string | string[] }> }) {
  const params = await searchParams
  const { items, server } = await getCoupons(pageParam(params.page), queryParam(params.q))
  return <CouponsClient initialItems={items} server={server} />
}

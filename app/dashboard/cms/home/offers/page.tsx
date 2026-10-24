import { operationsPage } from '@/lib/operations-page-data'
import { createHomeOffersRepository, HOME_OFFERS_NOT_READY } from '@/lib/db/admin-repositories/home-offers'
import type { HomeOffer, OfferCoupon } from '@/lib/home-offers-validation'
import { CMSTabs } from '@/components/cms-tabs'
import { OffersEditorClient } from './offers-editor-client'

export const dynamic = 'force-dynamic'

export default async function OffersPage() {
  let notice: string | null = null
  let data: { items: HomeOffer[]; coupons: OfferCoupon[] } = { items: [], coupons: [] }
  try {
    data = await operationsPage(async (db) => {
      const repository = createHomeOffersRepository(db)
      return { items: await repository.list(), coupons: await repository.coupons() }
    })
  } catch (error) {
    notice = error instanceof Error && error.message === HOME_OFFERS_NOT_READY ? HOME_OFFERS_NOT_READY : 'Unable to load the offers right now. Please reload the page.'
  }
  return (
    <div>
      <CMSTabs />
      <OffersEditorClient initialItems={data.items} coupons={data.coupons} notice={notice} />
    </div>
  )
}

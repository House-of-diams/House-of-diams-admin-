import { operationsPage } from '@/lib/operations-page-data'
import { createOfferSectionRepository, offerSectionRevision, OFFER_SECTION_NOT_READY } from '@/lib/db/admin-repositories/offer-section'
import { OFFER_SECTION_DEFAULTS } from '@/lib/offer-section-validation'
import { CMSTabs } from '@/components/cms-tabs'
import { OfferSectionEditorClient } from './offer-section-editor-client'

export const dynamic = 'force-dynamic'

export default async function OfferSectionPage() {
  let notice: string | null = null
  let data = { item: OFFER_SECTION_DEFAULTS, revision: offerSectionRevision(OFFER_SECTION_DEFAULTS) }
  try {
    data = await operationsPage(
      async (db) => {
        const item = await createOfferSectionRepository(db).read()
        return { item, revision: offerSectionRevision(item) }
      },
      async () => { throw new Error('The Offer Section needs the AWS database.') },
    )
  } catch (error) {
    notice = error instanceof Error && error.message === OFFER_SECTION_NOT_READY
      ? OFFER_SECTION_NOT_READY
      : 'Unable to load the Offer Section right now. Showing the default wording.'
  }
  return (
    <div>
      <CMSTabs />
      <OfferSectionEditorClient initialItem={data.item} initialRevision={data.revision} notice={notice} />
    </div>
  )
}

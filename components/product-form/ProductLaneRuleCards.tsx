'use client'

import { PillToggle } from '@/components/product-form/ProductFormControls'

export function ProductLaneRuleCards({
  isHiphopProduct,
  isCollectionProduct,
  allowCheckout,
  setAllowCheckout,
}: {
  isHiphopProduct: boolean
  isCollectionProduct: boolean
  allowCheckout: boolean
  setAllowCheckout: (value: boolean) => void
}) {
  return (
    <>
      {isHiphopProduct ? (
        <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <div className="border-l-2 border-foreground/20 pl-4">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Hip Hop Options</p>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Hip Hop Checkout</h2>
                <p className="mt-2 text-xs text-muted-foreground">Allow this Hip Hop product to go directly to checkout from the product page.</p>
              </div>
              <PillToggle value={allowCheckout} onChange={setAllowCheckout} onLabel="Checkout Allowed" offLabel="Checkout Disabled" />
            </div>
          </div>
        </section>
      ) : null}

      {isCollectionProduct ? (
        <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <div className="border-l-2 border-foreground/20 pl-4">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Collection Rules</p>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Checkout</h2>
                <p className="mt-2 text-xs text-muted-foreground">Collection products stay enquiry-first and never allow checkout.</p>
              </div>
              <span className="inline-flex rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">Checkout Disabled</span>
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}

'use client'

import { FormField, PillToggle, TagList } from '@/components/product-form/ProductFormControls'

type ProductLane = 'standard' | 'hiphop' | 'collection'
type DetailTemplate = 'standard' | 'hiphop'

export function ProductExperienceCard({
  forcedLane,
  detailTemplate,
  setDetailTemplate,
  isHiphopProduct,
  readyToShip,
  setReadyToShip,
  customOrderEnabled,
  setCustomOrderEnabled,
  hiphopBadgeInput,
  setHiphopBadgeInput,
  addHiphopBadge,
  hiphopBadges,
  removeHiphopBadge,
  chainLengthInput,
  setChainLengthInput,
  addChainLengthOption,
  chainLengthOptions,
  removeChainLengthOption,
  hiphopCaratLabel,
  setHiphopCaratLabel,
  gramWeightLabel,
  setGramWeightLabel,
  hiphopCaratInput,
  setHiphopCaratInput,
  addHiphopCaratValue,
  hiphopCaratValues,
  removeHiphopCaratValue,
  gramWeightValue,
  setGramWeightValue,
  inputClassName,
  secondaryButtonClassName,
}: {
  forcedLane: ProductLane | null
  detailTemplate: DetailTemplate
  setDetailTemplate: (value: DetailTemplate) => void
  isHiphopProduct: boolean
  readyToShip: boolean
  setReadyToShip: (value: boolean) => void
  customOrderEnabled: boolean
  setCustomOrderEnabled: (value: boolean) => void
  hiphopBadgeInput: string
  setHiphopBadgeInput: (value: string) => void
  addHiphopBadge: () => void
  hiphopBadges: string[]
  removeHiphopBadge: (value: string) => void
  chainLengthInput: string
  setChainLengthInput: (value: string) => void
  addChainLengthOption: () => void
  chainLengthOptions: string[]
  removeChainLengthOption: (value: string) => void
  hiphopCaratLabel: string
  setHiphopCaratLabel: (value: string) => void
  gramWeightLabel: string
  setGramWeightLabel: (value: string) => void
  hiphopCaratInput: string
  setHiphopCaratInput: (value: string) => void
  addHiphopCaratValue: () => void
  hiphopCaratValues: string[]
  removeHiphopCaratValue: (value: string) => void
  gramWeightValue: string
  setGramWeightValue: (value: string) => void
  inputClassName: string
  secondaryButtonClassName: string
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-6 text-lg font-semibold text-foreground">Product Experience</h2>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-secondary/10 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Product Mode</p>
            <p className="mt-2 text-xs text-muted-foreground">This form mode is set by the admin section you entered from, so the product stays in its correct lane.</p>
          </div>
          {forcedLane ? (
            <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
              forcedLane === 'hiphop'
                ? 'bg-foreground text-white'
                : forcedLane === 'collection'
                  ? 'bg-secondary text-foreground'
                  : 'bg-white border border-border text-foreground'
            }`}>
              {forcedLane === 'hiphop' ? 'Hip Hop' : forcedLane === 'collection' ? 'Collection' : 'Standard'}
            </span>
          ) : (
            <PillToggle
              value={detailTemplate === 'hiphop'}
              onChange={(next) => setDetailTemplate(next ? 'hiphop' : 'standard')}
              onLabel="Hip Hop"
              offLabel="Standard"
            />
          )}
        </div>

        {isHiphopProduct ? (
          <div className="space-y-6 border-l-2 border-foreground/20 pl-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Hip Hop Options</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-secondary/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Ready To Ship</p>
                    <p className="mt-2 text-xs text-muted-foreground">Show the in-stock premium badge on the Hip Hop detail page.</p>
                  </div>
                  <PillToggle value={readyToShip} onChange={setReadyToShip} onLabel="Enabled" offLabel="Disabled" />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-secondary/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Custom Order</p>
                    <p className="mt-2 text-xs text-muted-foreground">Show the bespoke / custom-order CTA emphasis for Hip Hop products.</p>
                  </div>
                  <PillToggle value={customOrderEnabled} onChange={setCustomOrderEnabled} onLabel="Enabled" offLabel="Disabled" />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-foreground">Hip Hop Badges</label>
              <div className="flex gap-2">
                <input
                  value={hiphopBadgeInput}
                  onChange={(e) => setHiphopBadgeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addHiphopBadge()
                    }
                  }}
                  placeholder="Add badge like Bespoke, Ready to Ship, Full Iced..."
                  className={`${inputClassName} flex-1`}
                />
                <button type="button" onClick={addHiphopBadge} className={secondaryButtonClassName}>Add</button>
              </div>
              <TagList items={hiphopBadges} onRemove={removeHiphopBadge} />
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-foreground">Chain / Length Options</label>
              <div className="flex gap-2">
                <input
                  value={chainLengthInput}
                  onChange={(e) => setChainLengthInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addChainLengthOption()
                    }
                  }}
                  placeholder='Add chain length like 18", 20", 22"...'
                  className={`${inputClassName} flex-1`}
                />
                <button type="button" onClick={addChainLengthOption} className={secondaryButtonClassName}>Add</button>
              </div>
              <TagList items={chainLengthOptions} onRemove={removeChainLengthOption} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Carat Label">
                <input value={hiphopCaratLabel} onChange={(e) => setHiphopCaratLabel(e.target.value)} placeholder="Diamond Carat" className={inputClassName} />
              </FormField>
              <FormField label="Gram Weight Label">
                <input value={gramWeightLabel} onChange={(e) => setGramWeightLabel(e.target.value)} placeholder="Gram Weight" className={inputClassName} />
              </FormField>
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-foreground">Carat Values</label>
              <div className="flex gap-2">
                <input
                  value={hiphopCaratInput}
                  onChange={(e) => setHiphopCaratInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addHiphopCaratValue()
                    }
                  }}
                  placeholder="Add carat like 0.5 ct, 1.0 ct, 4.0 ct+"
                  className={`${inputClassName} flex-1`}
                />
                <button type="button" onClick={addHiphopCaratValue} className={secondaryButtonClassName}>Add</button>
              </div>
              <TagList items={hiphopCaratValues} onRemove={removeHiphopCaratValue} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Gram Weight Value">
                <input value={gramWeightValue} onChange={(e) => setGramWeightValue(e.target.value)} placeholder="148 g" className={inputClassName} />
              </FormField>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

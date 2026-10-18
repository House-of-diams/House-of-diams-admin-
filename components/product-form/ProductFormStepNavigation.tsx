'use client'

import Link from 'next/link'
import type { ProductFormStepId } from '@/components/product-form'

type ProductFormStep = { id: ProductFormStepId; label: string; description: string }

export function ProductFormStepBar({
  steps,
  activeStep,
  onStepChange,
  onStepIntent,
}: {
  steps: ProductFormStep[]
  activeStep: ProductFormStepId
  onStepChange: (step: ProductFormStepId) => void
  onStepIntent?: (step: ProductFormStepId) => void
}) {
  const activeStepIndex = steps.findIndex((step) => step.id === activeStep)

  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Product Setup Flow</h2>
          <p className="mt-2 text-xs text-muted-foreground">Move step by step so the form loads lighter and each edit stays easier to manage.</p>
        </div>
        <span className="rounded-full border border-border bg-secondary/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {activeStepIndex + 1} / {steps.length}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-6">
        {steps.map((step, index) => {
          const isActive = step.id === activeStep
          const isCompleted = activeStepIndex > index

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepChange(step.id)}
              onMouseEnter={() => onStepIntent?.(step.id)}
              onFocus={() => onStepIntent?.(step.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                isActive
                  ? 'border-foreground bg-foreground text-white shadow-md'
                  : isCompleted
                    ? 'border-border bg-secondary/20 text-foreground hover:bg-secondary/40'
                    : 'border-border bg-white text-foreground hover:bg-secondary/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isActive ? 'bg-white/15 text-white' : 'bg-secondary text-foreground'
                  }`}
                >
                  {index + 1}
                </span>
                <p className="text-[13px] font-semibold leading-none">{step.label}</p>
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{steps.find((step) => step.id === activeStep)?.description}</p>
    </section>
  )
}

export function ProductFormStepActions({
  isFirstStep,
  isLastStep,
  saving,
  canSaveOnCurrentStep,
  backHref,
  submitLabel,
  onPrevious,
  onNext,
}: {
  isFirstStep: boolean
  isLastStep: boolean
  saving: boolean
  canSaveOnCurrentStep: boolean
  backHref: string
  submitLabel: string
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="sticky bottom-4 z-20 rounded-2xl border border-border border-t bg-white/98 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!isFirstStep ? (
            <button
              type="button"
              onClick={onPrevious}
              className="rounded border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Back
            </button>
          ) : (
            <Link href={backHref} className="rounded border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
              Cancel
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isLastStep ? (
            <>
            <button
              type="button"
              onClick={onNext}
              className="rounded bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              Continue
            </button>
            {canSaveOnCurrentStep ? (
              <button type="submit" disabled={saving} className="rounded bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60">
                {saving ? 'Saving...' : submitLabel}
              </button>
            ) : null}
            </>
          ) : (
            <>
              <Link href={backHref} className="rounded border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
                Cancel
              </Link>
              <button type="submit" disabled={saving} className="rounded bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60">
                {saving ? 'Saving...' : submitLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

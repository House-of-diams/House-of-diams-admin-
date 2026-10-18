'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProductContentRule } from '@/lib/product-catalog'

const inputClassName =
  'w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function PillToggle({
  value,
  onChange,
  onLabel = 'Enabled',
  offLabel = 'Disabled',
}: {
  value: boolean
  onChange: (value: boolean) => void
  onLabel?: string
  offLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        value ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'
      }`}
    >
      {value ? onLabel : offLabel}
    </button>
  )
}

export function PolicyEditor({
  title,
  description,
  enabled,
  onEnabledChange,
  rules,
  selectedRuleId,
  onRuleChange,
  overrideEnabled,
  onOverrideEnabledChange,
  titleOverride,
  onTitleOverrideChange,
  bodyOverride,
  onBodyOverrideChange,
}: {
  title: string
  description: string
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  rules: ProductContentRule[]
  selectedRuleId: string
  onRuleChange: (value: string) => void
  overrideEnabled: boolean
  onOverrideEnabledChange: (value: boolean) => void
  titleOverride: string
  onTitleOverrideChange: (value: string) => void
  bodyOverride: string
  onBodyOverrideChange: (value: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <PillToggle value={enabled} onChange={onEnabledChange} onLabel="Enabled" offLabel="Disabled" />
      </div>

      {enabled ? (
        <div className="mt-4 space-y-4">
          <FormField label={`${title} Rule`}>
            <Select value={selectedRuleId || '__none__'} onValueChange={(value) => onRuleChange(value === '__none__' ? '' : value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Select ${title.toLowerCase()} rule`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No linked rule</SelectItem>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="rounded-lg border border-border/70 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Override Linked Rule</p>
                <p className="mt-2 text-xs text-muted-foreground">Only enable this when the product needs custom shipping or warranty text instead of the shared rule.</p>
              </div>
              <PillToggle value={overrideEnabled} onChange={onOverrideEnabledChange} onLabel="Override On" offLabel="Use Rule" />
            </div>

            {overrideEnabled ? (
              <div className="mt-4 grid grid-cols-1 gap-4">
                <FormField label={`${title} Title Override`}>
                  <input
                    value={titleOverride}
                    onChange={(event) => onTitleOverrideChange(event.target.value)}
                    placeholder={`Leave blank to use the selected ${title.toLowerCase()} rule title`}
                    className={inputClassName}
                  />
                </FormField>
                <FormField label={`${title} Body Override`}>
                  <textarea
                    value={bodyOverride}
                    onChange={(event) => onBodyOverrideChange(event.target.value)}
                    rows={4}
                    placeholder={`Leave blank to use the selected ${title.toLowerCase()} rule body`}
                    className={inputClassName}
                  />
                </FormField>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

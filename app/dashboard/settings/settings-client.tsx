'use client'

import { useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, MessageCircle, Save, ShieldAlert } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { operationsFetch } from '@/lib/operations-transport'
import { openAdminAccount } from '@/lib/admin-auth-client'
import type { CatalogGstSlab } from '@/lib/product-catalog'

type SettingsTab = 'general' | 'security'

export type SiteSettings = {
  whatsapp_number: string
  default_gst_slab_id?: string
  maintenance_mode_enabled?: boolean
  maintenance_mode_message?: string
  estimated_delivery_text?: string
}

type WhatsappForm = {
  countryCode: string
  localNumber: string
}

type PasswordForm = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export type SettingsPageData = {
  settings: SiteSettings
  gstSlabs: CatalogGstSlab[]
}

const emptyPasswordForm: PasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

const whatsappCountryCodes = [
  { label: 'India', value: '+91' },
  { label: 'United States', value: '+1' },
  { label: 'United Kingdom', value: '+44' },
  { label: 'United Arab Emirates', value: '+971' },
  { label: 'Australia', value: '+61' },
  { label: 'Canada', value: '+1' },
  { label: 'Singapore', value: '+65' },
]

function normalizeWhatsappNumber(value: string) {
  return value.replace(/[^\d]/g, '')
}

function splitWhatsappNumber(value: string): WhatsappForm {
  const digits = normalizeWhatsappNumber(value)
  const matchedCode = whatsappCountryCodes
    .map((item) => item.value.replace('+', ''))
    .sort((a, b) => b.length - a.length)
    .find((code) => digits.startsWith(code))

  if (matchedCode) {
    return {
      countryCode: `+${matchedCode}`,
      localNumber: digits.slice(matchedCode.length),
    }
  }

  return {
    countryCode: '+91',
    localNumber: digits,
  }
}

function buildStoredWhatsappNumber(form: WhatsappForm) {
  const countryDigits = form.countryCode.replace(/[^\d]/g, '')
  const localDigits = normalizeWhatsappNumber(form.localNumber)
  return `${countryDigits}${localDigits}`
}

export function SettingsClient({ initialData, authProvider = 'supabase' }: { initialData: SettingsPageData; authProvider?: 'supabase' | 'keycloak' }) {
  const [accountError, setAccountError] = useState('')
  const [openingAccount, setOpeningAccount] = useState(false)
  const manageAccount = async () => {
    setOpeningAccount(true)
    setAccountError('')
    try { window.location.assign(await openAdminAccount()) }
    catch (error) { setAccountError(error instanceof Error ? error.message : 'Account management unavailable.'); setOpeningAccount(false) }
  }
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [savingSettings, setSavingSettings] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [settings, setSettings] = useState<SiteSettings>(initialData.settings)
  const [gstSlabs] = useState<CatalogGstSlab[]>(initialData.gstSlabs)
  const [defaultGstSlabId, setDefaultGstSlabId] = useState(initialData.settings.default_gst_slab_id ?? '')
  const [maintenanceModeEnabled, setMaintenanceModeEnabled] = useState(Boolean(initialData.settings.maintenance_mode_enabled))
  const [maintenanceModeMessage, setMaintenanceModeMessage] = useState(
    initialData.settings.maintenance_mode_message ??
      'Our atelier is receiving a careful polish. House of Diams will be back online shortly.'
  )
  const [estimatedDeliveryText, setEstimatedDeliveryText] = useState(
    initialData.settings.estimated_delivery_text ?? 'Approximately 3 to 4 weeks'
  )
  const [whatsappForm, setWhatsappForm] = useState<WhatsappForm>(splitWhatsappNumber(initialData.settings.whatsapp_number ?? ''))
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm)
  const [visiblePasswordFields, setVisiblePasswordFields] = useState<Record<keyof PasswordForm, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  })
  const [settingsConfirmOpen, setSettingsConfirmOpen] = useState(false)
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false)

  const settingsFingerprint = useMemo(() => JSON.stringify({
    whatsapp_number: buildStoredWhatsappNumber(whatsappForm),
    default_gst_slab_id: defaultGstSlabId,
    maintenance_mode_enabled: maintenanceModeEnabled,
    maintenance_mode_message: maintenanceModeMessage.trim(),
    estimated_delivery_text: estimatedDeliveryText.trim(),
  }), [defaultGstSlabId, estimatedDeliveryText, maintenanceModeEnabled, maintenanceModeMessage, whatsappForm])
  const initialSettingsFingerprint = useMemo(() => JSON.stringify({
    whatsapp_number: normalizeWhatsappNumber(initialData.settings.whatsapp_number ?? ''),
    default_gst_slab_id: initialData.settings.default_gst_slab_id ?? '',
    maintenance_mode_enabled: Boolean(initialData.settings.maintenance_mode_enabled),
    maintenance_mode_message: (initialData.settings.maintenance_mode_message ?? 'Our atelier is receiving a careful polish. House of Diams will be back online shortly.').trim(),
    estimated_delivery_text: (initialData.settings.estimated_delivery_text ?? 'Approximately 3 to 4 weeks').trim(),
  }), [initialData.settings])
  const [savedSettingsFingerprint, setSavedSettingsFingerprint] = useState(initialSettingsFingerprint)
  const settingsChanged = settingsFingerprint !== savedSettingsFingerprint
  const passwordChanged = Object.values(passwordForm).some(Boolean)
  const passwordReady = Boolean(passwordForm.currentPassword && passwordForm.newPassword.length >= 8 && passwordForm.newPassword === passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.currentPassword)
  useUnsavedChanges(settingsChanged || passwordChanged)

  const whatsappPreviewLink = useMemo(() => {
    const digits = normalizeWhatsappNumber(buildStoredWhatsappNumber(whatsappForm))
    return digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent("Hi, I'd like to enquire about House of Diams")}`
      : ''
  }, [whatsappForm])

  const renderPasswordField = (field: keyof PasswordForm) => {
    const isVisible = visiblePasswordFields[field]
    return (
      <div className="relative">
        <input
          type={isVisible ? 'text' : 'password'}
          value={passwordForm[field]}
          onChange={(e) => setPasswordForm((prev) => ({ ...prev, [field]: e.target.value }))}
          className="w-full rounded-lg border border-border bg-white px-4 py-2.5 pr-11 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setVisiblePasswordFields((prev) => ({ ...prev, [field]: !prev[field] }))}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    )
  }
  const saveSettings = async () => {
    setSavingSettings(true)
    try {

      const nextSettings = {
        whatsapp_number: buildStoredWhatsappNumber(whatsappForm),
        default_gst_slab_id: defaultGstSlabId || null,
        maintenance_mode_enabled: maintenanceModeEnabled,
        maintenance_mode_message: maintenanceModeMessage.trim(),
        estimated_delivery_text: estimatedDeliveryText.trim(),
      }

      const response = await operationsFetch('/api/settings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(nextSettings),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to save settings.')
      }

      setSettings({
        whatsapp_number: nextSettings.whatsapp_number,
        default_gst_slab_id: nextSettings.default_gst_slab_id ?? '',
        maintenance_mode_enabled: nextSettings.maintenance_mode_enabled,
        maintenance_mode_message: nextSettings.maintenance_mode_message,
        estimated_delivery_text: nextSettings.estimated_delivery_text,
      })
      setSavedSettingsFingerprint(settingsFingerprint)

      toast({
        title: 'Saved',
        description: 'Settings updated successfully.',
      })
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save settings.',
        variant: 'destructive',
      })
    } finally {
      setSavingSettings(false)
      setSettingsConfirmOpen(false)
    }
  }

  const changePassword = async () => {
    setChangingPassword(true)
    try {

      const response = await operationsFetch('/api/settings/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(passwordForm),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to change password.')
      }

      setPasswordForm(emptyPasswordForm)
      toast({
        title: 'Password changed',
        description: payload?.message ?? 'Password updated successfully. Please sign in again for a fresh session.',
      })
    } catch (error) {
      toast({
        title: 'Password change failed',
        description: error instanceof Error ? error.message : 'Unable to change password.',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
      setPasswordConfirmOpen(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage live store support details and your admin account security.</p>
      </div>

      <div className="mb-8 flex gap-2 overflow-x-auto border-b border-border">
        {[
          { id: 'general', label: 'General', icon: MessageCircle },
          { id: 'security', label: 'Security', icon: KeyRound },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors duration-150 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'general' ? (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-6">
              <h2 className="font-jakarta text-lg font-semibold text-foreground">Floating WhatsApp Number</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This number is used by the floating WhatsApp icon on the live storefront.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">WhatsApp Number</label>
                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <select
                    value={whatsappForm.countryCode}
                    onChange={(e) => setWhatsappForm((prev) => ({ ...prev, countryCode: e.target.value }))}
                    className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {whatsappCountryCodes.map((item, index) => (
                      <option key={`${item.value}-${item.label}-${index}`} value={item.value}>
                        {item.label} ({item.value})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={whatsappForm.localNumber}
                    onChange={(e) => setWhatsappForm((prev) => ({ ...prev, localNumber: e.target.value }))}
                    placeholder="Enter WhatsApp number"
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Choose the country code first, then enter the rest of the number. We will save one clean WhatsApp number for the live floating button.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground">Live Preview</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {whatsappPreviewLink || 'Enter a WhatsApp number to generate the live floating button link.'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Saved format: {buildStoredWhatsappNumber(whatsappForm) || 'No number yet'}
                </p>
                {settings.whatsapp_number ? (
                  <p className="mt-2 text-xs text-muted-foreground">Current saved number: {settings.whatsapp_number}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Estimated Delivery Text</label>
                <input
                  type="text"
                  value={estimatedDeliveryText}
                  onChange={(e) => setEstimatedDeliveryText(e.target.value)}
                  placeholder="Approximately 3 to 4 weeks"
                  className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Shown in the cart, checkout, and order confirmation as the delivery estimate.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Default Checkout Tax</label>
                <select
                  value={defaultGstSlabId}
                  onChange={(e) => setDefaultGstSlabId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Use first active GST slab as fallback</option>
                  {gstSlabs
                    .filter((item) => item.status !== 'hidden')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.percentage}%)
                      </option>
                    ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Used in checkout when a product has no GST slab assigned.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-amber-700" />
                      <p className="text-sm font-semibold text-foreground">Maintenance Mode</p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      When enabled, the storefront immediately shows a branded maintenance screen and blocks all public pages.
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={maintenanceModeEnabled}
                      onChange={(e) => setMaintenanceModeEnabled(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                    <span className="text-sm font-semibold text-foreground">
                      {maintenanceModeEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-foreground">Maintenance Message</label>
                  <textarea
                    value={maintenanceModeMessage}
                    onChange={(e) => setMaintenanceModeMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettingsConfirmOpen(true)}
              disabled={savingSettings || !settingsChanged}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} />
              Save Settings
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'security' && authProvider === 'keycloak' ? (
        <section className="max-w-3xl space-y-4 rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Account security</h2>
          <p>Manage your password and account security at the House of Diams identity service. You may be asked to sign in again. Return here after completing the change.</p>
          {accountError && <p role="alert">{accountError}</p>}
          <button type="button" disabled={openingAccount} onClick={() => void manageAccount()} className="rounded-lg bg-primary px-4 py-3 text-white">{openingAccount ? 'Opening…' : 'Manage account security'}</button>
        </section>
      ) : null}

      {activeTab === 'security' && authProvider === 'supabase' ? (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-6">
              <h2 className="font-jakarta text-lg font-semibold text-foreground">Change Password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your current password is required first. Changing your password keeps the same admin account and role, but you should sign in again after changing it.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Current Password</label>
                {renderPasswordField('currentPassword')}

              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">New Password</label>
                  {renderPasswordField('newPassword')}

                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Confirm Password</label>
                  {renderPasswordField('confirmPassword')}

                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Minimum 8 characters. After a successful password change, sign in again for a clean admin session.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPasswordConfirmOpen(true)}
              disabled={changingPassword || !passwordReady}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound size={16} />
              Update Password
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={settingsConfirmOpen}
        title="Save general settings?"
        description="This will update the live storefront settings, including maintenance mode if changed."
        confirmText="Save"
        cancelText="Cancel"
        type="confirm"
        isLoading={savingSettings}
        onConfirm={() => void saveSettings()}
        onCancel={() => {
          if (!savingSettings) setSettingsConfirmOpen(false)
        }}
      />

      <ConfirmDialog
        isOpen={passwordConfirmOpen}
        title="Change your admin password?"
        description="This updates the password for your current admin account. Your role and RLS access stay tied to the same user, but you should sign in again after this change."
        confirmText="Change Password"
        cancelText="Cancel"
        type="warning"
        isLoading={changingPassword}
        onConfirm={() => void changePassword()}
        onCancel={() => {
          if (!changingPassword) setPasswordConfirmOpen(false)
        }}
      />
    </div>
  )
}

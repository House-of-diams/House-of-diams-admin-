'use client'

import { Loader2, Save } from 'lucide-react'

type CmsSaveActionProps = {
  onClick: () => void
  isSaving?: boolean
  disabled?: boolean
  label?: string
  position?: 'bottom-right' | 'top-right' | 'inline'
}

export function CmsSaveAction({
  onClick,
  isSaving = false,
  disabled = false,
  label = 'Save Changes',
  position = 'bottom-right',
}: CmsSaveActionProps) {
  const positionClass =
    position === 'inline'
      ? 'static'
      : position === 'top-right'
        ? 'top-6 right-6'
        : 'bottom-6 right-6'

  return (
    <button
      onClick={onClick}
      disabled={isSaving || disabled}
      className={`${
        position === 'inline' ? 'inline-flex' : 'fixed'
      } ${positionClass} ${position === 'inline' ? '' : 'z-40'} flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
      {isSaving ? 'Saving...' : label}
    </button>
  )
}

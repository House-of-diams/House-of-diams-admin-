'use client'

import { useEffect, useState } from 'react'

export function useUnsavedChanges(hasChanges: boolean) {
  const [showWarning, setShowWarning] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  useEffect(() => {
    if (!hasChanges) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  const confirmNavigation = (callback: () => void) => {
    if (hasChanges) {
      setPendingAction(() => callback)
      setShowWarning(true)
    } else {
      callback()
    }
  }

  const handleDiscard = () => {
    setShowWarning(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
  }

  return { showWarning, setShowWarning, confirmNavigation, handleDiscard }
}

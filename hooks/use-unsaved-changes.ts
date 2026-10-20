'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

// HOD-056: every mounted editor with unsaved changes is registered here, so
// navigation outside the editor (sidebar, top bar) can ask before leaving, and so
// a save can release its editor synchronously before reloading or navigating.
const dirtyEditors = new Set<symbol>()

export function hasUnsavedChanges() {
  return dirtyEditors.size > 0
}

/** true when it is fine to leave: nothing is unsaved, or the admin confirmed. */
export function confirmLeaveIfUnsaved() {
  return !hasUnsavedChanges() || window.confirm('You have unsaved changes. Leave this page without saving them?')
}

/** onClick for links outside an editor; cancels the navigation if the admin stays. */
export function guardNavigation(event: MouseEvent<HTMLElement>) {
  if (!confirmLeaveIfUnsaved()) event.preventDefault()
}

export function useUnsavedChanges(hasChanges: boolean) {
  const [showWarning, setShowWarning] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const token = useRef<symbol | null>(null)

  useEffect(() => {
    if (!hasChanges) return
    const editor = Symbol('unsaved-editor')
    token.current = editor
    dirtyEditors.add(editor)

    // Closing or reloading the tab. A released editor (saved) no longer asks.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyEditors.has(editor)) return
      e.preventDefault()
      e.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      dirtyEditors.delete(editor)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
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

  /** Stops warning immediately (before React re-renders), e.g. right before a reload. */
  const release = () => { if (token.current) dirtyEditors.delete(token.current) }

  return { showWarning, setShowWarning, confirmNavigation, handleDiscard, release }
}

/**
 * HOD-056: warns before leaving once the admin edits anything inside the editor.
 * Spread `bind` on the editor's root element; input/change events from dialogs
 * rendered in portals reach it too. Call reset() after a successful save.
 * `active` limits the warning, e.g. to while a dialog editor is open.
 */
export function useEditGuard(active = true) {
  const [touched, setTouched] = useState(false)
  const unsaved = useUnsavedChanges(active && touched)
  // Edits only count while active; closing (saved or cancelled) clears them.
  const [wasActive, setWasActive] = useState(active)
  if (wasActive !== active) {
    setWasActive(active)
    if (!active) setTouched(false)
  }
  const markTouched = () => { if (active) setTouched(true) }
  return {
    touched: active && touched,
    reset: () => { unsaved.release(); setTouched(false) },
    bind: { onInputCapture: markTouched, onChangeCapture: markTouched },
  }
}

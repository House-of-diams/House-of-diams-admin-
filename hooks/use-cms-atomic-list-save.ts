'use client'

import { useRef, useState } from 'react'

type PersistedItem = Record<string, unknown> & { id?: string | number | null }

export function useCmsAtomicListSave(initialItems: PersistedItem[], initialRevision: string) {
  const [revision, setRevision] = useState(initialRevision)
  const [savedItemIds, setSavedItemIds] = useState(() => initialItems.flatMap((item) => item.id == null ? [] : [String(item.id)]))
  const pendingSave = useRef<{ fingerprint: string; requestId: string } | null>(null)

  function prepareSave<T extends Record<string, unknown>>(body: T, currentItems: PersistedItem[]) {
    const retainedIds = new Set(currentItems.flatMap((item) => item.id == null ? [] : [String(item.id)]))
    const saveBody = {
      ...body,
      expected_revision: revision,
      deleted_ids: savedItemIds.filter((id) => !retainedIds.has(id)),
    }
    const fingerprint = JSON.stringify(saveBody)
    if (pendingSave.current?.fingerprint !== fingerprint) {
      pendingSave.current = { fingerprint, requestId: crypto.randomUUID() }
    }
    return { ...saveBody, request_id: pendingSave.current.requestId }
  }

  function acceptSave(items: PersistedItem[], nextRevision: string) {
    setSavedItemIds(items.flatMap((item) => item.id == null ? [] : [String(item.id)]))
    setRevision(nextRevision)
    pendingSave.current = null
  }

  return { prepareSave, acceptSave }
}

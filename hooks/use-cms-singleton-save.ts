'use client'

import { useRef, useState } from 'react'

export function useCmsSingletonSave(initialRevision: string) {
  const [revision, setRevision] = useState(initialRevision)
  const pendingSave = useRef<{ fingerprint: string; requestId: string } | null>(null)

  function prepareSave<T extends Record<string, unknown>>(item: T) {
    const saveBody = { expected_revision: revision, item }
    const fingerprint = JSON.stringify(saveBody)
    if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, requestId: crypto.randomUUID() }
    return { ...saveBody, request_id: pendingSave.current.requestId }
  }

  function acceptSave(nextRevision: string) {
    setRevision(nextRevision)
    pendingSave.current = null
  }

  return { prepareSave, acceptSave }
}

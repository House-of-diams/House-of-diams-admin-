'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { adminPageDataGroup, dataSourcePresentation } from '@/lib/admin-data-source'

export function AdminDataSourceStatus() {
  const group = adminPageDataGroup(usePathname())
  const [result, setResult] = useState<{ group: string; source: string; checked: boolean } | null>(null)
  useEffect(() => {
    if (['demo', 'local', 'unknown'].includes(group)) return
    const controller = new AbortController()
    async function check() {
      try {
        const response = await fetch(`/api/admin/data-source-status?group=${group}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        })
        const value = await response.json()
        if (!controller.signal.aborted) setResult({ group,
          source: ['rds', 'supabase'].includes(value.source) ? value.source : 'unknown',
          checked: response.ok && value.checked === true && value.group === group })
      } catch { if (!controller.signal.aborted) setResult({ group, source: 'unknown', checked: false }) }
    }
    void check()
    return () => controller.abort()
  }, [group])

  const presentation = group === 'demo' ? { text: 'Demo data', tone: 'legacy' }
    : group === 'local' ? { text: 'Local navigation', tone: 'legacy' }
      : group === 'unknown' ? dataSourcePresentation('unknown', false)
        : result?.group === group ? dataSourcePresentation(result.source, result.checked)
          : { text: 'Checking data source…', tone: 'checking' }
  const dot = presentation.tone === 'verified' ? 'bg-green-600' : presentation.tone === 'error' ? 'bg-red-600'
    : presentation.tone === 'checking' ? 'bg-amber-500' : 'bg-slate-500'
  return <span role="status" aria-live="polite"
    title={group === 'demo' ? 'This screen currently uses local demonstration data.'
      : group === 'local' ? 'This screen searches a local navigation list.'
        : `Source for the ${group} section. RDS verification checks one fresh representative read, not every page query, writes, authentication or media storage.`}
    className="mx-3 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-medium text-foreground shadow-sm">
    <span aria-hidden="true" className={`inline-block size-2 rounded-full ${dot}`} />{presentation.text}
  </span>
}

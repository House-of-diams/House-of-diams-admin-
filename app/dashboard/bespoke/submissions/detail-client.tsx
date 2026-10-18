'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { BespokeSubmission } from './submissions-client'

export function BespokeSubmissionDetailClient({ item }: { item: BespokeSubmission }) {
  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/dashboard/bespoke/submissions" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
          <ArrowLeft size={16} />
          Back to Submissions
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Submission Details</h1>
        <p className="mt-2 text-xs text-muted-foreground">Submission loaded</p>
      </div>

      <div className="max-w-4xl space-y-6 rounded-lg border border-border bg-white p-6 shadow-xs">
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Full Name" value={item.full_name} />
          <Detail label="Email" value={item.email} />
          <Detail label="Phone" value={item.phone || 'No phone'} />
          <Detail label="Country" value={item.country} />
          <Detail label="Piece Type" value={item.piece_type} />
          <Detail label="Stone Preference" value={item.stone_preference || 'Not provided'} />
          <Detail label="Approx Carat" value={item.approx_carat || 'Not provided'} />
          <Detail label="Preferred Metal" value={item.preferred_metal || 'Not provided'} />
          <Detail label="Status" value={item.status} />
          <Detail label="Submitted At" value={`${new Date(item.created_at).toLocaleDateString()} ${new Date(item.created_at).toLocaleTimeString()}`} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Message</label>
          <div className="rounded-lg border border-border bg-secondary/10 p-4 text-sm whitespace-pre-wrap text-foreground">{item.message || 'No message provided.'}</div>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-foreground">{label}</label>
      <div className="rounded-lg border border-border bg-secondary/10 px-4 py-3 text-sm text-foreground">{value}</div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export function ProductFormRedirectOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="rounded-2xl border border-border bg-white px-8 py-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-black/10 border-t-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">Redirecting to products</p>
            <p className="mt-1 text-xs text-muted-foreground">Please wait while the updated product list loads.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductFormHeader({
  backHref,
  title,
  description,
}: {
  backHref: string
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Link href={backHref} className="rounded p-1.5 transition-colors hover:bg-secondary">
        <ChevronLeft size={20} />
      </Link>
      <div>
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export function ProductFormSkeleton() {
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-3 w-80 max-w-[70vw]" />
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-72 max-w-[70vw]" />
          </div>
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[58px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-3 w-64 max-w-[70vw]" />
      </section>

      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <Skeleton className="mb-8 h-6 w-44" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <Skeleton className="mb-8 h-6 w-56" />
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function ProductFormLoadingShell({
  backHref,
  title,
  description,
}: {
  backHref: string
  title: string
  description: string
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="rounded p-1.5 transition-colors hover:bg-secondary">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
          <div>
            <p className="text-sm font-semibold text-foreground">Loading product details</p>
            <p className="mt-1 text-xs text-muted-foreground">Catalog basics are ready. Product-specific fields are loading now.</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-2 md:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[58px] rounded-xl" />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </section>
    </div>
  )
}

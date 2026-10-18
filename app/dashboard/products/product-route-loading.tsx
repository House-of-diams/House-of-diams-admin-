import { Skeleton } from '@/components/ui/skeleton'

export function ProductRouteLoading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="p-8">
      <div className="flex max-w-5xl flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </div>
        <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <Skeleton className="h-6 w-48" />
          <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-[58px] rounded-xl" />
            ))}
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </section>
      </div>
    </div>
  )
}

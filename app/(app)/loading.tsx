export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-col gap-3">
        <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-8 w-72 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
      <div className="grid gap-6 md:grid-cols-3">
        <div className="h-64 animate-pulse rounded-lg border border-border bg-surface md:col-span-2" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
    </div>
  )
}

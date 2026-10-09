import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { InstanceRow } from '@/lib/dsp/instances'

/** Tabs to choose which number a per-number screen (Proteções) shows. */
export function NumberPicker({ instances, current, basePath }: { instances: InstanceRow[]; current: string; basePath: string }) {
  if (instances.length < 2) return null
  return (
    <nav aria-label="Número" className="flex flex-wrap gap-2">
      {instances.map((i) => (
        <Link
          key={i.id}
          href={`${basePath}?n=${i.id}`}
          aria-current={i.id === current ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            i.id === current ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}

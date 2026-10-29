'use client'

import { useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Phones open with the numbers; filters wait behind one tap. From `lg` they are always visible. */
export function FiltersCollapsible({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="profit-filters"
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 text-left text-sm font-medium shadow-[0_1px_2px_rgb(6_22_40/0.05)] transition-colors hover:border-primary/40 lg:hidden"
      >
        <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="shrink-0">Filtrar período / Opções</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div id="profit-filters" className={cn(open ? 'mt-3 block' : 'hidden', 'lg:mt-0 lg:block')}>
        {children}
      </div>
    </div>
  )
}

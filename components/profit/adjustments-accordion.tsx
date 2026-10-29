'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AdjustmentsAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(6_22_40/0.05)]">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 sm:px-5"
        >
          {title}
          <ChevronDown
            className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-300', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h2>
      <div
        id={bodyId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-5 border-t border-border px-4 py-4 sm:px-5">{children}</div>
        </div>
      </div>
    </section>
  )
}

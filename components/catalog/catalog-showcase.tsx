'use client'

import { useState } from 'react'
import { ProductRail } from '@/components/catalog/product-rail'
import { trackCatalog } from '@/lib/catalog/analytics'
import { AUDIENCES, type Audience, type Showcase } from '@/lib/catalog/curation'
import { cn } from '@/lib/utils'

export function CatalogShowcase({ showcase }: { showcase: Showcase }) {
  const [audience, setAudience] = useState<Audience | null>(null)

  function choose(next: Audience) {
    const value = audience === next ? null : next
    setAudience(value)
    if (value) trackCatalog('audience_selected', { audience: value })
  }

  const sections = showcase.sections
    .map((section) => ({
      ...section,
      items: section.ids
        .filter((id) => !audience || showcase.audiences[id]?.includes(audience))
        .map((id) => showcase.items[id]),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <div id="selecao" className="scroll-mt-14">
      <div className="sticky top-14 z-20 border-b border-border/70 bg-background/95 backdrop-blur-md md:top-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:gap-6 md:px-8 md:py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Você está procurando para:
          </p>
          <div className="grid grid-cols-3 gap-2 md:flex" role="group" aria-label="Filtrar seleção por público">
            {AUDIENCES.map(({ key, label, hint }) => (
              <button
                key={key}
                type="button"
                onClick={() => choose(key)}
                aria-pressed={audience === key}
                title={hint}
                className={cn(
                  'h-11 min-w-0 truncate rounded-full px-2 text-xs font-semibold uppercase tracking-[0.1em] transition-colors md:px-5 md:tracking-[0.16em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60',
                  audience === key
                    ? 'bg-foreground text-background'
                    : 'bg-surface text-foreground ring-1 ring-border hover:ring-foreground/30',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {audience ? (
            <p className="hidden text-sm text-muted-foreground md:block" aria-live="polite">
              {AUDIENCES.find((a) => a.key === audience)?.hint}
            </p>
          ) : null}
        </div>
      </div>

      {sections.map((section, index) => (
        <section
          key={section.key}
          id={section.key}
          aria-labelledby={`${section.key}-title`}
          className="mx-auto flex max-w-6xl scroll-mt-32 flex-col gap-6 px-5 pt-12 md:px-8 md:pt-16"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-8">
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-info">{section.eyebrow}</p>
              <h2 id={`${section.key}-title`} className="text-2xl font-semibold tracking-tight md:text-3xl">
                {section.title}
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty md:text-right">
              {section.description}
            </p>
          </div>
          <ProductRail items={section.items} label={section.title} badges={showcase.badges} priority={index === 0} />
        </section>
      ))}
    </div>
  )
}

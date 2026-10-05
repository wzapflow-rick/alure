'use client'

import { useMemo, useState } from 'react'
import { ProductCard } from '@/components/catalog/product-card'
import { trackCatalog } from '@/lib/catalog/analytics'
import { availableGroups, itemGroups } from '@/lib/catalog/merchandising'
import type { CatalogItem } from '@/lib/catalog/types'
import { cn } from '@/lib/utils'

const ALL = 'Todos'

export function ProductGrid({ items }: { items: CatalogItem[] }) {
  const groups = useMemo(() => availableGroups(items), [items])
  const [active, setActive] = useState(ALL)
  const visible = active === ALL ? items : items.filter((i) => itemGroups(i).includes(active))

  return (
    <div className="flex flex-col gap-8">
      {groups.length > 0 ? (
        <div
          className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0"
          role="group"
          aria-label="Filtrar por categoria"
        >
          {[ALL, ...groups].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setActive(label)
                trackCatalog('category_selected', { category: label })
              }}
              aria-pressed={active === label}
              className={cn(
                'h-10 shrink-0 snap-start rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60',
                active === label
                  ? 'bg-foreground text-background'
                  : 'bg-surface text-foreground ring-1 ring-border hover:ring-foreground/30',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
        {visible.map((item, index) => (
          <li key={item.id}>
            <ProductCard item={item} priority={index < 2} />
          </li>
        ))}
      </ul>
    </div>
  )
}

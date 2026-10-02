'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AddToCart } from '@/components/catalog/add-to-cart'
import { ProductImage } from '@/components/catalog/product-image'
import type { CatalogItem } from '@/lib/catalog/types'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALL = 'Todos'

export function ProductGrid({ items }: { items: CatalogItem[] }) {
  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))
    return [ALL, ...[...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [items])
  const [active, setActive] = useState(ALL)
  const visible = active === ALL ? items : items.filter((i) => i.category === active)

  return (
    <div className="flex flex-col gap-8">
      {categories.length > 2 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por categoria">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              aria-pressed={active === c}
              className={cn(
                'h-9 shrink-0 rounded-full border px-4 text-sm transition-colors',
                active === c
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface text-foreground hover:border-foreground/30',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-4">
            <Link
              href={`/catalogo/${item.id}`}
              className="group relative block overflow-hidden rounded-2xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
            >
              <ProductImage
                src={item.images[0]}
                alt={item.name}
                sku={item.sku}
                sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
                priority={index < 3}
                className="aspect-square transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 font-mono text-[11px] tracking-wide text-foreground">
                {item.sku}
              </span>
            </Link>

            <div className="flex flex-col gap-1">
              {item.category || item.finish ? (
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {[item.category, item.finish].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              <h3 className="text-base font-medium leading-snug text-pretty">
                <Link href={`/catalogo/${item.id}`} className="hover:underline hover:underline-offset-4">
                  {item.name}
                </Link>
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-lg font-semibold">{formatBRL(item.price)}</span>
                {item.compareAtPrice ? (
                  <span className="tabular text-sm text-muted-foreground line-through">{formatBRL(item.compareAtPrice)}</span>
                ) : null}
              </div>
            </div>

            <AddToCart item={item} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Plus } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { ProductImage } from '@/components/catalog/product-image'
import { trackCatalog } from '@/lib/catalog/analytics'
import { discountPercent, shortProductName } from '@/lib/catalog/merchandising'
import type { EnrichedItem } from '@/lib/catalog/taxonomy'
import { formatBRL } from '@/lib/format'

export function ProductTile({
  item,
  bestSeller,
  priority = false,
}: {
  item: EnrichedItem
  bestSeller: boolean
  priority?: boolean
}) {
  const { add, lines } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const inCart = lines.find((l) => l.id === item.id)?.qty ?? 0
  const discount = discountPercent(item)
  const href = `/catalogo/${item.id}`

  function handleAdd() {
    add(item, 1)
    trackCatalog('add_to_cart', { sku: item.sku, qty: 1, value: item.price, from: 'grid' })
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1400)
  }

  return (
    <article className="group/card flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,box-shadow] duration-300 hover:border-foreground/20 hover:shadow-[0_6px_24px_-12px_rgba(18,28,37,0.18)]">
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="relative block overflow-hidden"
        onClick={() => trackCatalog('product_click', { sku: item.sku, id: item.id })}
      >
        <ProductImage
          src={item.images[0]}
          alt=""
          sku={item.sku}
          sizes="(min-width: 1536px) 240px, (min-width: 1280px) 22vw, (min-width: 768px) 30vw, 48vw"
          priority={priority}
          className="aspect-square transition-transform duration-500 ease-out group-hover/card:scale-[1.035]"
        />
        {discount ? (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground">
            {`-${discount}%`}
          </span>
        ) : bestSeller ? (
          <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground ring-1 ring-border">
            Mais vendido
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1 border-t border-border/70 px-3.5 pb-3.5 pt-3 md:px-4 md:pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {item.brand ?? item.categoryLabel}
        </p>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-snug text-foreground text-pretty md:text-sm">
          <Link
            href={href}
            onClick={() => trackCatalog('product_click', { sku: item.sku, id: item.id })}
            className="focus-visible:outline-none focus-visible:underline hover:underline hover:underline-offset-4"
          >
            {shortProductName(item.name)}
          </Link>
        </h3>
        <p className="font-mono text-[10.5px] tracking-wide text-muted-foreground">{`SKU ${item.sku}`}</p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="flex min-w-0 flex-col">
            {item.compareAtPrice ? (
              <span className="tabular text-xs text-muted-foreground line-through">
                <span className="sr-only">Preço anterior </span>
                {formatBRL(item.compareAtPrice)}
              </span>
            ) : null}
            <span className="tabular text-base font-semibold text-foreground md:text-[17px]">
              <span className="sr-only">Preço </span>
              {formatBRL(item.price)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
            aria-label={`Adicionar ${item.name} ao pedido`}
          >
            {justAdded ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          </button>
        </div>
        <p className="h-4 text-[11px] text-muted-foreground" aria-live="polite">
          {inCart > 0 ? `${inCart} no pedido` : ''}
        </p>
      </div>
    </article>
  )
}

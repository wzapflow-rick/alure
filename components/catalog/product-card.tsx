import Link from 'next/link'
import { AddToCart } from '@/components/catalog/add-to-cart'
import { ProductImage } from '@/components/catalog/product-image'
import { BADGE_LABEL, type Badge } from '@/lib/catalog/curation'
import { itemBrand, shortProductName } from '@/lib/catalog/merchandising'
import type { CatalogItem } from '@/lib/catalog/types'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ProductCard({
  item,
  badge,
  priority = false,
}: {
  item: CatalogItem
  badge?: Badge
  priority?: boolean
}) {
  const brand = itemBrand(item)

  return (
    <article className="flex h-full flex-col gap-3">
      <Link
        href={`/catalogo/${item.id}`}
        className="group relative block overflow-hidden rounded-xl bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
      >
        <ProductImage
          src={item.images[0]}
          alt={item.name}
          sku={item.sku}
          sizes="(min-width: 1024px) 260px, (min-width: 768px) 30vw, 62vw"
          priority={priority}
          className="aspect-square transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {badge ? (
          <span
            className={cn(
              'absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
              badge === 'oferta' ? 'bg-primary text-primary-foreground' : 'bg-background/95 text-foreground',
            )}
          >
            {BADGE_LABEL[badge]}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        {brand ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{brand}</p>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-pretty md:text-[15px]">
          <Link href={`/catalogo/${item.id}`} className="hover:underline hover:underline-offset-4">
            {shortProductName(item.name)}
          </Link>
        </h3>
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground">{`SKU: ${item.sku}`}</p>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          <span className="tabular text-lg font-semibold">{formatBRL(item.price)}</span>
          {item.compareAtPrice ? (
            <span className="tabular text-sm text-muted-foreground line-through">
              <span className="sr-only">Preço anterior </span>
              {formatBRL(item.compareAtPrice)}
            </span>
          ) : null}
        </div>
      </div>

      <AddToCart item={item} layout="stack" />
    </article>
  )
}

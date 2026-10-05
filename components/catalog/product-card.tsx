import Link from 'next/link'
import { AddToCart } from '@/components/catalog/add-to-cart'
import { ProductImage } from '@/components/catalog/product-image'
import { discountPercent, itemBrand, itemGroups } from '@/lib/catalog/merchandising'
import type { CatalogItem } from '@/lib/catalog/types'
import { formatBRL } from '@/lib/format'

export function ProductCard({ item, priority = false }: { item: CatalogItem; priority?: boolean }) {
  const discount = discountPercent(item)
  const eyebrow = [itemBrand(item), itemGroups(item)[0] ?? item.category].filter(Boolean).join(' · ')

  return (
    <article className="flex h-full flex-col gap-3">
      <Link
        href={`/catalogo/${item.id}`}
        className="group relative block overflow-hidden rounded-2xl bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
      >
        <ProductImage
          src={item.images[0]}
          alt={item.name}
          sizes="(min-width: 1024px) 260px, (min-width: 768px) 30vw, 46vw"
          priority={priority}
          className="aspect-square transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {discount ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            {`-${discount}%`}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        {eyebrow ? <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p> : null}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-pretty md:text-[15px]">
          <Link href={`/catalogo/${item.id}`} className="hover:underline hover:underline-offset-4">
            {item.name}
          </Link>
        </h3>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="tabular text-lg font-semibold">{formatBRL(item.price)}</span>
          {item.compareAtPrice ? (
            <span className="tabular text-sm text-muted-foreground line-through">{formatBRL(item.compareAtPrice)}</span>
          ) : null}
        </div>
      </div>

      <AddToCart item={item} layout="stack" />
    </article>
  )
}

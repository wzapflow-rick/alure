import { ProductCard } from '@/components/catalog/product-card'
import type { CatalogItem } from '@/lib/catalog/types'

/** Horizontal, swipeable row on mobile; regular grid from md up. */
export function ProductRail({ items, label }: { items: CatalogItem[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-4"
    >
      {items.map((item) => (
        <li key={item.id} className="w-[46%] shrink-0 snap-start md:w-auto">
          <ProductCard item={item} />
        </li>
      ))}
    </ul>
  )
}

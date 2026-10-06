import { ProductCard } from '@/components/catalog/product-card'
import type { Badge } from '@/lib/catalog/curation'
import type { CatalogItem } from '@/lib/catalog/types'

/** Horizontal, swipeable row on mobile (next card peeks in); regular grid from md up. */
export function ProductRail({
  items,
  label,
  badges = {},
  priority = false,
}: {
  items: CatalogItem[]
  label: string
  badges?: Record<number, Badge>
  priority?: boolean
}) {
  return (
    <ul
      aria-label={label}
      className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto overscroll-x-contain px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:scroll-px-0 md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-4"
    >
      {items.map((item, index) => (
        <li key={item.id} className="w-[70%] min-w-0 shrink-0 snap-start sm:w-[44%] md:w-auto">
          <ProductCard item={item} badge={badges[item.id]} priority={priority && index < 2} />
        </li>
      ))}
    </ul>
  )
}

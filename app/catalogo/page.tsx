import { isDbConfigured } from '@/lib/db'
import { listBestSellerIds, listPublishedItems } from '@/lib/catalog/queries'
import { buildShowcase } from '@/lib/catalog/curation'
import { CatalogShowcase } from '@/components/catalog/catalog-showcase'
import { ProductGrid } from '@/components/catalog/product-grid'
import { ProCta } from '@/components/catalog/pro-cta'
import { CatalogHero } from '@/components/catalog/catalog-hero'
import { BrandSignature } from '@/components/catalog/brand-signature'
import { TrackEvent } from '@/components/catalog/track-event'
import type { CatalogItem } from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

/** Below this many curated matches the showcase would look empty, so the full list is shown instead. */
const MIN_CURATED = 4

async function loadCatalog(): Promise<{ items: CatalogItem[]; bestSellerIds: number[] } | null> {
  if (!isDbConfigured()) return null
  try {
    const [items, bestSellerIds] = await Promise.all([listPublishedItems(), listBestSellerIds(40)])
    return { items, bestSellerIds }
  } catch (error) {
    console.error('[alure] catalog load failed:', error)
    return null
  }
}

export default async function CatalogPage() {
  const catalog = await loadCatalog()
  const showcase = catalog ? buildShowcase(catalog.items, catalog.bestSellerIds) : null
  const curated = showcase !== null && showcase.curatedCount >= MIN_CURATED

  return (
    <>
      <TrackEvent event="catalog_open" />

      <CatalogHero />

      <div className="pt-8 md:pt-12">
        {catalog === null ? (
          <p className="mx-auto max-w-6xl px-5 text-muted-foreground md:px-8">
            O catálogo está indisponível no momento. Tente novamente em instantes.
          </p>
        ) : curated ? (
          <CatalogShowcase showcase={showcase} />
        ) : catalog.items.length === 0 ? (
          <p className="mx-auto max-w-6xl px-5 text-muted-foreground md:px-8">Novos produtos em breve.</p>
        ) : (
          <section id="selecao" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-6 px-5 md:px-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Seleção ALURE</h2>
            <ProductGrid items={catalog.items} />
          </section>
        )}
      </div>

      <ProCta />
      <BrandSignature />
    </>
  )
}

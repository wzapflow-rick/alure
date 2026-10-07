import { Suspense } from 'react'
import type { Metadata } from 'next'
import { isDbConfigured } from '@/lib/db'
import { listBestSellerIds, listPublishedItems } from '@/lib/catalog/queries'
import { activeCategories, dedupeBySku, type TaxonomyConfig } from '@/lib/catalog/taxonomy'
import { getTaxonomyConfig } from '@/lib/catalog/taxonomy-store'
import { CatalogBrowser } from '@/components/catalog/catalog-browser'
import { ProCta } from '@/components/catalog/pro-cta'
import { CatalogHero } from '@/components/catalog/catalog-hero'
import { BrandSignature } from '@/components/catalog/brand-signature'
import { TrackEvent } from '@/components/catalog/track-event'
import type { CatalogItem } from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { categoria } = await searchParams
  if (!categoria || !isDbConfigured()) return {}
  const category = activeCategories(await getTaxonomyConfig()).find((c) => c.slug === categoria)
  if (!category) return {}
  return {
    title: `${category.label} | Catálogo ALURE`,
    description: `${category.label} com preço de venda direta. Monte seu pedido e finalize pelo WhatsApp.`,
  }
}

async function loadCatalog(): Promise<{ items: CatalogItem[]; bestSellerIds: number[]; taxonomy: TaxonomyConfig } | null> {
  if (!isDbConfigured()) return null
  try {
    const [items, bestSellerIds, taxonomy] = await Promise.all([
      listPublishedItems(),
      listBestSellerIds(500),
      getTaxonomyConfig(),
    ])
    return { items: dedupeBySku(items), bestSellerIds, taxonomy }
  } catch (error) {
    console.error('[alure] catalog load failed:', error)
    return null
  }
}

export default async function CatalogPage() {
  const catalog = await loadCatalog()

  return (
    <>
      <TrackEvent event="catalog_open" />

      <CatalogHero productCount={catalog?.items.length ?? null} />

      {catalog === null ? (
        <p className="mx-auto max-w-[1440px] px-5 pt-12 text-muted-foreground md:px-8">
          O catálogo está indisponível no momento. Tente novamente em instantes.
        </p>
      ) : catalog.items.length === 0 ? (
        <p className="mx-auto max-w-[1440px] px-5 pt-12 text-muted-foreground md:px-8">Novos produtos em breve.</p>
      ) : (
        <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
          <CatalogBrowser items={catalog.items} bestSellerIds={catalog.bestSellerIds} taxonomy={catalog.taxonomy} />
        </Suspense>
      )}

      <ProCta />
      <BrandSignature />
    </>
  )
}

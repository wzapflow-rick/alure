import Image from 'next/image'
import { isDbConfigured } from '@/lib/db'
import { listBestSellerIds, listPublishedItems } from '@/lib/catalog/queries'
import { buildShowcase } from '@/lib/catalog/curation'
import { CatalogShowcase } from '@/components/catalog/catalog-showcase'
import { ProductGrid } from '@/components/catalog/product-grid'
import { ProCta } from '@/components/catalog/pro-cta'
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

      <section className="mx-auto max-w-6xl px-5 pt-4 md:px-8 md:pt-8">
        <div className="grid overflow-hidden rounded-2xl bg-surface-2 md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col justify-center gap-4 px-6 py-7 md:gap-5 md:px-12 md:py-14">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-info">
              {'Metais • Acabamentos • Soluções'}
            </p>
            <h1 className="text-[1.85rem] font-semibold leading-[1.08] tracking-tight text-balance md:text-5xl">
              Metais e acabamentos Deca para seus projetos.
            </h1>
            <p className="max-w-md leading-relaxed text-muted-foreground text-pretty">
              Uma seleção ALURE para profissionais, lojas e projetos.
            </p>
            <a
              href="#selecao"
              className="inline-flex h-12 w-fit items-center rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ver produtos
            </a>
          </div>
          <div className="relative aspect-[16/9] md:aspect-auto md:min-h-[420px]">
            <Image
              src="/catalogo/hero.png"
              alt="Misturador cromado sobre bancada de pedra clara"
              fill
              priority
              sizes="(min-width: 1152px) 600px, (min-width: 768px) 52vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

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
      <div className="h-16 md:h-24" />
    </>
  )
}

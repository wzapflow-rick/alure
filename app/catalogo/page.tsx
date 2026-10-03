import Image from 'next/image'
import { isDbConfigured } from '@/lib/db'
import { listPublishedItems } from '@/lib/catalog/queries'
import { ProductGrid } from '@/components/catalog/product-grid'
import type { CatalogItem } from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

async function loadItems(): Promise<CatalogItem[] | null> {
  if (!isDbConfigured()) return null
  try {
    return await listPublishedItems()
  } catch (error) {
    console.error('[alure] catalog load failed:', error)
    return null
  }
}

export default async function CatalogPage() {
  const items = await loadItems()

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-6 md:px-8 md:pt-10">
        <div className="relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface-2 md:min-h-[440px] md:justify-center">
          <div className="relative z-10 flex max-w-lg flex-col gap-5 p-7 md:p-12">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-info">Venda direta</p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-balance md:text-5xl">
              Metais e acabamentos, direto de quem vende.
            </h1>
            <p className="max-w-md leading-relaxed text-muted-foreground text-pretty">
              Escolha os produtos e as quantidades, envie o pedido e a gente confirma disponibilidade, frete e prazo com você
              pelo WhatsApp.
            </p>
            <a
              href="#produtos"
              className="inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Ver produtos
            </a>
          </div>
          <div className="relative aspect-[16/10] md:absolute md:inset-0 md:aspect-auto">
            <Image
              src="/catalogo/hero.png"
              alt="Misturador cromado sobre bancada de pedra clara"
              fill
              priority
              sizes="(min-width: 1152px) 1088px, 100vw"
              className="object-cover md:object-right"
            />
            <div className="absolute inset-0 hidden bg-gradient-to-r from-surface-2 via-surface-2/70 to-transparent md:block" />
          </div>
        </div>
      </section>

      <section id="produtos" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-8 px-5 py-14 md:px-8 md:py-20">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Seleção</h2>
          {items?.length ? (
            <p className="text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? 'produto' : 'produtos'} · preços por unidade
            </p>
          ) : null}
        </div>
        {items === null ? (
          <p className="text-muted-foreground">O catálogo está indisponível no momento. Tente novamente em instantes.</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">Novos produtos em breve.</p>
        ) : (
          <ProductGrid items={items} />
        )}
      </section>
    </>
  )
}

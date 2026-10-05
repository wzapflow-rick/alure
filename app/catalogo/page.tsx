import Image from 'next/image'
import { BadgeCheck, MessageCircle, Tag, Users } from 'lucide-react'
import { isDbConfigured } from '@/lib/db'
import { listBestSellerIds, listPublishedItems } from '@/lib/catalog/queries'
import { ProductGrid } from '@/components/catalog/product-grid'
import { ProductRail } from '@/components/catalog/product-rail'
import { WhatsAppHelp } from '@/components/catalog/whatsapp-help'
import type { CatalogItem } from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

async function loadCatalog(): Promise<{ items: CatalogItem[]; bestSellerIds: number[] } | null> {
  if (!isDbConfigured()) return null
  try {
    const [items, bestSellerIds] = await Promise.all([listPublishedItems(), listBestSellerIds()])
    return { items, bestSellerIds }
  } catch (error) {
    console.error('[alure] catalog load failed:', error)
    return null
  }
}

const BENEFITS = [
  { icon: BadgeCheck, label: 'Produtos Deca' },
  { icon: Tag, label: 'Preços competitivos' },
  { icon: Users, label: 'Atendimento direto' },
  { icon: MessageCircle, label: 'Compra pelo WhatsApp' },
]

export default async function CatalogPage() {
  const catalog = await loadCatalog()
  const items = catalog?.items ?? null
  const offers = items?.filter((i) => i.compareAtPrice !== null) ?? []
  const byId = new Map(items?.map((i) => [i.id, i]) ?? [])
  const bestSellers = (catalog?.bestSellerIds ?? []).map((id) => byId.get(id)).filter((i): i is CatalogItem => Boolean(i))

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-5 md:px-8 md:pt-8">
        <div className="grid overflow-hidden rounded-3xl bg-surface-2 md:grid-cols-[1fr_1.15fr]">
          <div className="flex flex-col justify-center gap-5 px-6 py-8 md:px-12 md:py-14">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-info">Venda direta ALURE</p>
            <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-tight text-balance md:text-5xl">
              Metais e acabamentos Deca para seu projeto.
            </h1>
            <p className="max-w-md leading-relaxed text-muted-foreground text-pretty">
              Produtos selecionados, preços especiais e atendimento direto pelo WhatsApp.
            </p>
            <a
              href="#produtos"
              className="inline-flex h-12 w-fit items-center rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ver produtos
            </a>
          </div>
          <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[400px]">
            <Image
              src="/catalogo/hero.png"
              alt="Misturador cromado sobre bancada de pedra clara"
              fill
              priority
              sizes="(min-width: 1152px) 600px, (min-width: 768px) 54vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <section aria-label="Por que comprar com a ALURE" className="mx-auto max-w-6xl px-5 md:px-8">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border py-6 md:flex md:justify-between md:py-7">
          {BENEFITS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5 text-sm text-foreground">
              <Icon className="size-4 shrink-0 text-info" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </section>

      {offers.length > 0 ? (
        <section id="ofertas" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-6 px-5 pt-12 md:px-8 md:pt-16">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-info">Preço especial</p>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Ofertas ALURE</h2>
            </div>
            <p className="hidden text-sm text-muted-foreground md:block">
              {offers.length} {offers.length === 1 ? 'produto' : 'produtos'}
            </p>
          </div>
          <ProductRail items={offers} label="Ofertas ALURE" />
        </section>
      ) : null}

      {bestSellers.length >= 2 ? (
        <section id="mais-vendidos" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-6 px-5 pt-12 md:px-8 md:pt-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Mais vendidos</h2>
          <ProductRail items={bestSellers} label="Mais vendidos" />
        </section>
      ) : null}

      <section id="produtos" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-6 px-5 py-12 md:px-8 md:py-16">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">O que você procura?</h2>
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

      <WhatsAppHelp />
    </>
  )
}

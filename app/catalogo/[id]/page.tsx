import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPublishedItem } from '@/lib/catalog/queries'
import { ProductGallery } from '@/components/catalog/product-gallery'
import { AddToCart } from '@/components/catalog/add-to-cart'
import { formatBRL } from '@/lib/format'

export const dynamic = 'force-dynamic'

async function load(idParam: string) {
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) return null
  return getPublishedItem(id).catch(() => null)
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const item = await load((await params).id)
  if (!item) return { title: 'Produto' }
  return {
    title: item.name,
    description: item.description ?? `${item.name} · SKU ${item.sku} · ${formatBRL(item.price)} na venda direta.`,
    openGraph: item.images[0] ? { images: [{ url: item.images[0] }] } : undefined,
  }
}

export default async function CatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const item = await load((await params).id)
  if (!item) notFound()

  const savings = item.compareAtPrice ? Math.round((1 - item.price / item.compareAtPrice) * 100) : 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 md:px-8 md:py-12">
      <Link href="/catalogo#produtos" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Voltar ao catálogo
      </Link>

      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <ProductGallery images={item.images} name={item.name} sku={item.sku} />

        <div className="flex flex-col gap-6 md:pt-4">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs tracking-wider text-muted-foreground">SKU {item.sku}</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance md:text-4xl">{item.name}</h1>
            {item.category || item.finish ? (
              <p className="text-sm uppercase tracking-widest text-muted-foreground">
                {[item.category, item.finish].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 border-y border-border py-5">
            <div className="flex items-baseline gap-3">
              <span className="tabular text-3xl font-semibold">{formatBRL(item.price)}</span>
              {item.compareAtPrice ? (
                <span className="tabular text-base text-muted-foreground line-through">{formatBRL(item.compareAtPrice)}</span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {savings > 0 ? `Preço de venda direta, ${savings}% abaixo do marketplace.` : 'Preço de venda direta, por unidade.'}
            </p>
          </div>

          <AddToCart item={item} />

          {item.description ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Descrição</h2>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground text-pretty">{item.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

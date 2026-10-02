import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { toggleCatalogPublished } from '@/lib/actions/catalog'
import { countNewOrders, listAdminItems } from '@/lib/catalog/queries'
import { formatBRL } from '@/lib/format'

export const metadata: Metadata = { title: 'Venda direta' }

export default async function CatalogAdminPage() {
  const [items, newOrders] = await Promise.all([listAdminItems(), countNewOrders()])
  const published = items.filter((i) => i.published).length

  return (
    <>
      <PageHeader
        eyebrow="Venda direta"
        title="Catálogo"
        description={`${published} de ${items.length} itens publicados. Preços, fotos e descrições editados aqui aparecem na hora em /catalogo.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/catalogo" target="_blank" className={buttonVariants({ size: 'sm' })}>
              <ExternalLink className="size-4" aria-hidden /> Ver catálogo
            </Link>
            <Link href="/venda-direta/pedidos" className={buttonVariants({ size: 'sm' })}>
              Pedidos {newOrders ? <Badge tone="attention">{newOrders} novos</Badge> : null}
            </Link>
            <Link href="/venda-direta/novo" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Plus className="size-4" aria-hidden /> Novo item
            </Link>
          </div>
        }
      />

      <Panel>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-[#ffffff]">
                  {item.images[0] ? (
                    <Image src={item.images[0]} alt="" fill sizes="56px" className="object-contain p-1" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-[10px] text-[#5d6872]">sem foto</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href={`/venda-direta/${item.id}`} className="truncate text-sm font-medium hover:underline">
                    {item.name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                </div>
                <div className="hidden flex-col items-end sm:flex">
                  <span className="tabular text-sm font-medium">{formatBRL(item.price)}</span>
                  {item.compareAtPrice ? (
                    <span className="tabular text-xs text-muted-foreground line-through">{formatBRL(item.compareAtPrice)}</span>
                  ) : null}
                </div>
                {item.published ? <Badge tone="positive">Publicado</Badge> : <Badge>Oculto</Badge>}
                <InlineAction
                  action={toggleCatalogPublished}
                  fields={{ id: item.id, published: String(!item.published) }}
                  label={item.published ? 'Ocultar' : 'Publicar'}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nenhum item no catálogo."
            description="Rode o script db/010_catalog.sql para criar as tabelas e a seleção inicial, ou crie um item novo."
          />
        )}
      </Panel>
    </>
  )
}

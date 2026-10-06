import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badges'
import { EmptyState, Input, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { Chips } from '@/components/ui/tab-nav'
import { InlineAction } from '@/components/forms/action-form'
import { toggleCatalogPublished } from '@/lib/actions/catalog'
import { countNewOrders, listAdminItems } from '@/lib/catalog/queries'
import { formatBRL } from '@/lib/format'

export const metadata: Metadata = { title: 'Venda direta' }

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'published', label: 'Publicados' },
  { key: 'hidden', label: 'Ocultos' },
]

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default async function CatalogAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = '', f = 'all' } = await searchParams
  const filter = FILTERS.some((x) => x.key === f) ? f : 'all'
  const [allItems, newOrders] = await Promise.all([listAdminItems(), countNewOrders()])
  const published = allItems.filter((i) => i.published).length

  const terms = normalize(q.trim()).split(/\s+/).filter(Boolean)
  const items = allItems.filter((item) => {
    if (filter === 'published' && !item.published) return false
    if (filter === 'hidden' && item.published) return false
    if (!terms.length) return true
    const haystack = normalize(`${item.name} ${item.sku}`)
    return terms.every((t) => haystack.includes(t))
  })
  const filtering = terms.length > 0 || filter !== 'all'

  return (
    <>
      <PageHeader
        eyebrow="Venda direta"
        title="Catálogo"
        description={`${published} de ${allItems.length} itens publicados. Preços, fotos e descrições editados aqui aparecem na hora em /catalogo.`}
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

      {allItems.length ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form role="search" action="/venda-direta" className="relative flex-1 sm:max-w-sm">
            {filter !== 'all' ? <input type="hidden" name="f" value={filter} /> : null}
            <label htmlFor="q" className="sr-only">
              Buscar item do catálogo
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Buscar por nome ou SKU" className="pl-9" />
          </form>
          <Chips
            label="Status"
            items={FILTERS.map((x) => ({
              key: x.key,
              href: { pathname: '/venda-direta', query: { ...(q ? { q } : {}), ...(x.key !== 'all' ? { f: x.key } : {}) } },
              label: x.label,
              active: filter === x.key,
            }))}
          />
        </div>
      ) : null}

      {filtering && allItems.length ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {items.length} {items.length === 1 ? 'item encontrado' : 'itens encontrados'}
          {q ? (
            <>
              {' para '}
              <span className="font-medium text-foreground">{`“${q}”`}</span>
            </>
          ) : null}
          {' · '}
          <Link href="/venda-direta" className="underline hover:text-foreground">
            Limpar
          </Link>
        </p>
      ) : null}

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
        ) : allItems.length ? (
          <EmptyState title="Nenhum item encontrado." description="Tente outro nome, parte do SKU ou limpe o filtro." />
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

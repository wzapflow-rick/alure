import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Badge, CLASSIFICATION_LABEL } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { formatBRL, formatInt } from '@/lib/format'
import { listProducts } from '@/lib/queries'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProductsPage() {
  const products = await listProducts()
  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo, custo médio e classificação estratégica."
        action={
          <Link href="/produtos/novo" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Plus className="size-4" aria-hidden /> Novo produto
          </Link>
        }
      />
      <Panel>
        {products.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-normal">Produto</th>
                  <th scope="col" className="px-5 py-2 font-normal">Classificação</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Custo médio</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Canais</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Receita 30d</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Pedidos 30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => (
                  <tr key={p.id} className={p.active ? 'hover:bg-surface-2' : 'opacity-50 hover:bg-surface-2'}>
                    <td className="px-5 py-3">
                      <Link href={`/produtos/${p.id}`} className="flex flex-col hover:underline">
                        <span>{p.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{p.sku}{p.category ? ` · ${p.category}` : ''}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3"><Badge>{CLASSIFICATION_LABEL[p.classification]}</Badge></td>
                    <td className="px-5 py-3 text-right tabular">
                      {p.average_cost ? formatBRL(p.average_cost) : <span className="text-attention">Sem custo</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular">{p.channels}</td>
                    <td className="px-5 py-3 text-right tabular">{p.revenue_30d ? formatBRL(p.revenue_30d) : '—'}</td>
                    <td className="px-5 py-3 text-right tabular">{p.orders_30d ? formatInt(p.orders_30d) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum produto cadastrado." description="Cadastre o primeiro produto para que o motor possa calcular margem e prioridades." />
        )}
      </Panel>
    </>
  )
}

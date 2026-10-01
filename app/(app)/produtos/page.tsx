import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EmptyState, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { ProductsTable } from '@/components/products/products-table'
import { listProducts } from '@/lib/queries'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [products, { q }] = await Promise.all([listProducts(), searchParams])
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
          <ProductsTable products={products} initialQuery={q?.slice(0, 80) ?? ''} />
        ) : (
          <EmptyState title="Nenhum produto cadastrado." description="Cadastre o primeiro produto para que o motor possa calcular margem e prioridades." />
        )}
      </Panel>
    </>
  )
}

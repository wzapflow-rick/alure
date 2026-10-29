import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Upload } from 'lucide-react'
import { EmptyState, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { ProductsTable } from '@/components/products/products-table'
import { listProducts } from '@/lib/queries'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [products, { q, status }] = await Promise.all([listProducts(), searchParams])
  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo, custo médio e classificação estratégica."
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link
              href="/produtos/importar-custos"
              className={buttonVariants({ variant: 'secondary', className: 'h-11 active:scale-[0.98] sm:h-9' })}
            >
              <Upload className="size-4" aria-hidden /> Importar custos
            </Link>
            <Link
              href="/produtos/novo"
              className={buttonVariants({ variant: 'primary', className: 'h-11 active:scale-[0.98] sm:h-9' })}
            >
              <Plus className="size-4" aria-hidden /> Novo produto
            </Link>
          </div>
        }
      />
      <Panel>
        {products.length ? (
          <ProductsTable products={products} initialQuery={q?.slice(0, 80) ?? ''} initialMissingCost={status === 'no_cost'} />
        ) : (
          <EmptyState title="Nenhum produto cadastrado." description="Cadastre o primeiro produto para que o motor possa calcular margem e prioridades." />
        )}
      </Panel>
    </>
  )
}

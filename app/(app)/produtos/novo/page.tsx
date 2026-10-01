import type { Metadata } from 'next'
import { PageHeader, Panel } from '@/components/ui/primitives'
import { ProductForm } from '@/components/products/product-forms'

export const metadata: Metadata = { title: 'Novo produto' }

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="Novo produto" description="Depois de criar, adicione os canais e os lotes de custo." />
      <Panel>
        <div className="max-w-3xl px-5 py-6">
          <ProductForm />
        </div>
      </Panel>
    </>
  )
}

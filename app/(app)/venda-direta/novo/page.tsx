import type { Metadata } from 'next'
import { PageHeader, Panel } from '@/components/ui/primitives'
import { CatalogItemForm } from '@/components/catalog-admin/item-form'
import { query } from '@/lib/db'

export const metadata: Metadata = { title: 'Novo item · Venda direta' }

export default async function NewCatalogItemPage() {
  const rows = await query<{ id: string; sku: string; name: string }>(
    `SELECT p.id, p.sku, p.name FROM products p
      WHERE p.active AND NOT EXISTS (SELECT 1 FROM catalog_items c WHERE c.sku = p.sku)
      ORDER BY p.sku`,
  )
  const products = rows.map((r) => ({ id: Number(r.id), sku: r.sku, name: r.name }))

  return (
    <>
      <PageHeader eyebrow="Venda direta" title="Novo item" description="Depois de criar, você adiciona as fotos." />
      <Panel className="p-5">
        <CatalogItemForm products={products} />
      </Panel>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { CatalogItemForm } from '@/components/catalog-admin/item-form'
import { ImageManager } from '@/components/catalog-admin/image-manager'
import { deleteCatalogItem } from '@/lib/actions/catalog'
import { getAdminItem, getCatalogTaxonomyOptions } from '@/lib/catalog/queries'

export const metadata: Metadata = { title: 'Editar item · Venda direta' }

export default async function EditCatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [item, options] = await Promise.all([getAdminItem(id), getCatalogTaxonomyOptions()])
  if (!item) notFound()

  return (
    <>
      <Link href="/venda-direta" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Catálogo
      </Link>
      <PageHeader
        eyebrow={`SKU ${item.sku}`}
        title={item.name}
        action={
          item.published ? (
            <Link href={`/catalogo/${item.id}`} target="_blank" className={buttonVariants({ size: 'sm' })}>
              <ExternalLink className="size-4" aria-hidden /> Ver no catálogo
            </Link>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel title="Dados" className="[&>div]:p-5">
          <div>
            <CatalogItemForm item={item} options={options} />
          </div>
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="Fotos">
            <div className="p-5">
              <ImageManager id={item.id} images={item.images} />
            </div>
          </Panel>
          <Panel title="Remover">
            <div className="flex flex-col gap-3 p-5">
              <p className="text-sm text-muted-foreground">Apaga o item e as fotos. Para só esconder, desmarque “Publicado”.</p>
              <div>
                <InlineAction action={deleteCatalogItem} fields={{ id: item.id }} label="Excluir item" variant="danger" />
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

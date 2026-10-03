'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { saveCatalogItem } from '@/lib/actions/catalog'
import type { CatalogAdminItem } from '@/lib/catalog/types'

type ProductOption = { id: number; sku: string; name: string }

function money(v: number | null | undefined) {
  return v === null || v === undefined ? '' : v.toFixed(2).replace('.', ',')
}

export function CatalogItemForm({ item, products }: { item?: CatalogAdminItem; products?: ProductOption[] }) {
  return (
    <ActionForm action={saveCatalogItem} className="gap-5">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {item?.productId ? <input type="hidden" name="productId" value={item.productId} /> : null}

      {!item && products?.length ? (
        <Field label="Vincular a um produto (opcional)" htmlFor="ci-product" hint="Preenche SKU e nome se você deixar em branco.">
          <Select id="ci-product" name="productId" defaultValue="">
            <option value="">Nenhum</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <Field label="SKU" htmlFor="ci-sku">
          <Input id="ci-sku" name="sku" defaultValue={item?.sku} maxLength={64} className="font-mono" />
        </Field>
        <Field label="Nome no catálogo" htmlFor="ci-name">
          <Input id="ci-name" name="name" defaultValue={item?.name} maxLength={200} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Preço de venda direta (R$)" htmlFor="ci-price">
          <Input id="ci-price" name="price" inputMode="decimal" required defaultValue={money(item?.price)} placeholder="0,00" />
        </Field>
        <Field label="Preço de referência riscado (R$)" htmlFor="ci-compare" hint="Ex.: preço do marketplace. Só aparece se for maior.">
          <Input id="ci-compare" name="compareAtPrice" inputMode="decimal" defaultValue={money(item?.compareAtPrice)} placeholder="0,00" />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Categoria" htmlFor="ci-category" hint="Vira filtro no catálogo.">
          <Input id="ci-category" name="category" defaultValue={item?.category ?? ''} maxLength={80} placeholder="Misturadores" />
        </Field>
        <Field label="Acabamento" htmlFor="ci-finish">
          <Input id="ci-finish" name="finish" defaultValue={item?.finish ?? ''} maxLength={80} placeholder="Cromado" />
        </Field>
        <Field label="Ordem" htmlFor="ci-order" hint="Menor aparece primeiro.">
          <Input id="ci-order" name="sortOrder" type="number" min={0} defaultValue={item?.sortOrder ?? 0} />
        </Field>
      </div>

      <Field label="Descrição" htmlFor="ci-description">
        <Textarea id="ci-description" name="description" rows={5} maxLength={2000} defaultValue={item?.description ?? ''} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={item?.published ?? true} className="size-4 accent-primary" />
        Publicado no catálogo
      </label>

      <div>
        <SubmitButton variant="primary">{item ? 'Salvar alterações' : 'Criar item'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

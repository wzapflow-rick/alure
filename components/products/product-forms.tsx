'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { CLASSIFICATION_LABEL } from '@/components/ui/badges'
import { addCostLot, saveChannel, saveProduct } from '@/lib/actions/products'

export type ProductValues = {
  id?: string
  sku?: string
  name?: string
  brand?: string
  category?: string | null
  classification?: string
  classification_reason?: string | null
  notes?: string | null
  active?: boolean
}

export function ProductForm({ product }: { product?: ProductValues }) {
  return (
    <ActionForm action={saveProduct}>
      {product?.id ? <input type="hidden" name="id" value={product.id} /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="SKU" htmlFor="sku">
          <Input id="sku" name="sku" required defaultValue={product?.sku} placeholder="2875.C.LNK" />
        </Field>
        <Field label="Nome" htmlFor="name" className="md:col-span-2">
          <Input id="name" name="name" required defaultValue={product?.name} placeholder="Misturador monocomando Deca Link" />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Marca" htmlFor="brand">
          <Input id="brand" name="brand" defaultValue={product?.brand ?? 'Deca'} />
        </Field>
        <Field label="Categoria" htmlFor="category" hint="Usada para casar regras de taxa por categoria.">
          <Input id="category" name="category" defaultValue={product?.category ?? ''} placeholder="Metais" />
        </Field>
        <Field label="Classificação" htmlFor="classification" hint="Define como o motor avalia o produto: janela, ritmo esperado e o que pode recomendar.">
          <Select id="classification" name="classification" defaultValue={product?.classification ?? 'sem_classificacao'}>
            {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Motivo da classificação" htmlFor="classificationReason">
        <Input id="classificationReason" name="classificationReason" defaultValue={product?.classification_reason ?? ''} />
      </Field>
      <Field label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={product?.notes ?? ''} />
      </Field>
      {product?.id ? (
        <Field label="Status" htmlFor="active">
          <Select id="active" name="active" defaultValue={product.active === false ? 'false' : 'true'}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </Select>
        </Field>
      ) : null}
      <div>
        <SubmitButton>{product?.id ? 'Salvar produto' : 'Criar produto'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export type ChannelValues = {
  id: string
  marketplace_id: string
  external_id: string | null
  listing_title: string | null
  current_price: string
  ads_cost_pct: string
  seller_discount: string
  status: string
}

export function ChannelForm({
  productId,
  channel,
  marketplaces,
}: {
  productId: string
  channel?: ChannelValues
  marketplaces: { id: string; name: string }[]
}) {
  return (
    <ActionForm action={saveChannel} resetOnSuccess={!channel}>
      <input type="hidden" name="productId" value={productId} />
      {channel ? <input type="hidden" name="id" value={channel.id} /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Marketplace" htmlFor={`mk-${channel?.id ?? 'new'}`}>
          <Select id={`mk-${channel?.id ?? 'new'}`} name="marketplaceId" defaultValue={channel?.marketplace_id} disabled={Boolean(channel)}>
            {marketplaces.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          {channel ? <input type="hidden" name="marketplaceId" value={channel.marketplace_id} /> : null}
        </Field>
        <Field label="ID do anúncio" htmlFor={`ext-${channel?.id ?? 'new'}`}>
          <Input id={`ext-${channel?.id ?? 'new'}`} name="externalId" defaultValue={channel?.external_id ?? ''} placeholder="MLB123456789" />
        </Field>
        <Field label="Status" htmlFor={`st-${channel?.id ?? 'new'}`}>
          <Select id={`st-${channel?.id ?? 'new'}`} name="status" defaultValue={channel?.status ?? 'active'}>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
            <option value="inactive">Inativo</option>
          </Select>
        </Field>
      </div>
      <Field label="Título do anúncio" htmlFor={`tt-${channel?.id ?? 'new'}`}>
        <Input id={`tt-${channel?.id ?? 'new'}`} name="listingTitle" defaultValue={channel?.listing_title ?? ''} />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Preço atual (R$)" htmlFor={`pr-${channel?.id ?? 'new'}`}>
          <Input id={`pr-${channel?.id ?? 'new'}`} name="currentPrice" inputMode="decimal" required defaultValue={channel?.current_price ?? ''} />
        </Field>
        <Field label="Custo de Ads (% da receita)" htmlFor={`ad-${channel?.id ?? 'new'}`}>
          <Input id={`ad-${channel?.id ?? 'new'}`} name="adsCostPct" inputMode="decimal" defaultValue={channel?.ads_cost_pct ?? '0'} />
        </Field>
        <Field label="Desconto do vendedor (R$)" htmlFor={`ds-${channel?.id ?? 'new'}`}>
          <Input id={`ds-${channel?.id ?? 'new'}`} name="sellerDiscount" inputMode="decimal" defaultValue={channel?.seller_discount ?? '0'} />
        </Field>
      </div>
      {channel ? (
        <Field label="Motivo da alteração de preço" htmlFor={`rs-${channel.id}`} hint="Registrado no histórico se o preço mudar.">
          <Input id={`rs-${channel.id}`} name="reason" />
        </Field>
      ) : null}
      <div>
        <SubmitButton variant="secondary" size="sm">{channel ? 'Salvar canal' : 'Adicionar canal'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function CostLotForm({ productId, today }: { productId: string; today: string }) {
  return (
    <ActionForm action={addCostLot} resetOnSuccess>
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Quantidade" htmlFor="quantity">
          <Input id="quantity" name="quantity" type="number" min={1} required />
        </Field>
        <Field label="Custo unitário (R$)" htmlFor="unitCost">
          <Input id="unitCost" name="unitCost" inputMode="decimal" required />
        </Field>
        <Field label="Data" htmlFor="effectiveDate">
          <Input id="effectiveDate" name="effectiveDate" type="date" required defaultValue={today} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Fornecedor" htmlFor="supplier">
          <Input id="supplier" name="supplier" />
        </Field>
        <Field label="Observações" htmlFor="lotNotes">
          <Input id="lotNotes" name="notes" />
        </Field>
      </div>
      <div>
        <SubmitButton variant="secondary" size="sm">Adicionar lote</SubmitButton>
      </div>
    </ActionForm>
  )
}

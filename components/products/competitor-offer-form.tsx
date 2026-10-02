'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select } from '@/components/ui/primitives'
import { addCompetitorOffer } from '@/lib/actions/competition'

export function CompetitorOfferForm({
  productId,
  channels,
  today,
}: {
  productId: string
  channels: { id: string; marketplace_name: string }[]
  today: string
}) {
  return (
    <ActionForm action={addCompetitorOffer} resetOnSuccess>
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Canal" htmlFor="co-channel">
          <Select id="co-channel" name="productChannelId" defaultValue={channels[0]?.id}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.marketplace_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Concorrente" htmlFor="co-name" className="md:col-span-2">
          <Input id="co-name" name="competitorName" required placeholder="Nome da loja" />
        </Field>
        <Field label="Preço (R$)" htmlFor="co-price">
          <Input id="co-price" name="price" inputMode="decimal" required placeholder="89,90" />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Frete grátis" htmlFor="co-ship">
          <Select id="co-ship" name="freeShipping" defaultValue="">
            <option value="">Não informado</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </Select>
        </Field>
        <Field label="Full" htmlFor="co-full">
          <Select id="co-full" name="isFull" defaultValue="">
            <option value="">Não informado</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </Select>
        </Field>
        <Field label="Vendidos" htmlFor="co-sold" hint="Se o anúncio mostrar.">
          <Input id="co-sold" name="soldQuantity" type="number" min={0} />
        </Field>
        <Field label="Observado em" htmlFor="co-date">
          <Input id="co-date" name="observedOn" type="date" required defaultValue={today} max={today} />
        </Field>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Fonte, URL e observação</summary>
        <div className="grid gap-4 pt-4 md:grid-cols-3">
          <Field label="Fonte" htmlFor="co-source">
            <Input id="co-source" name="source" defaultValue="manual" />
          </Field>
          <Field label="URL do anúncio" htmlFor="co-url" className="md:col-span-2">
            <Input id="co-url" name="url" type="url" placeholder="https://" />
          </Field>
          <Field label="Observação" htmlFor="co-notes" className="md:col-span-3">
            <Input id="co-notes" name="notes" />
          </Field>
        </div>
      </details>
      <div>
        <SubmitButton variant="secondary" size="sm">Registrar observação</SubmitButton>
      </div>
    </ActionForm>
  )
}

'use client'

import { RefreshCw } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input } from '@/components/ui/primitives'
import { refreshShipping, saveAdSpend, saveTaxRate } from '@/lib/actions/profit'

export function RefreshShippingButton({ from, to }: { from: string; to: string }) {
  return (
    <ActionForm action={refreshShipping} className="flex-row flex-wrap items-center gap-3">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant="secondary" size="sm">
        <RefreshCw className="size-3.5" aria-hidden />
        Ler fretes do ML
      </SubmitButton>
    </ActionForm>
  )
}

export function AdSpendForm({ from, to }: { from: string; to: string }) {
  return (
    <ActionForm action={saveAdSpend} className="gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="De" htmlFor="ad-from">
          <Input id="ad-from" name="from" type="date" defaultValue={from} required />
        </Field>
        <Field label="Até" htmlFor="ad-to">
          <Input id="ad-to" name="to" type="date" defaultValue={to} required />
        </Field>
        <Field label="Valor por dia (R$)" htmlFor="ad-amount" className="col-span-2 sm:col-span-1">
          <Input id="ad-amount" name="amount" inputMode="decimal" placeholder="147,00" required />
        </Field>
        <Field label="Observação" htmlFor="ad-notes" className="col-span-2 sm:col-span-1">
          <Input id="ad-notes" name="notes" placeholder="Product Ads" maxLength={200} />
        </Field>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        O valor é gravado em cada dia do período e substitui o que já estava lançado. Para apagar, lance 0.
      </p>
      <div>
        <SubmitButton size="sm">Lançar investimento</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function TaxRateForm({ value }: { value: number }) {
  return (
    <ActionForm action={saveTaxRate} className="gap-3">
      <Field
        label="Alíquota de imposto sobre a venda (%)"
        htmlFor="tax-rate"
        hint="Ex.: Simples Nacional. Somado aos impostos que o próprio ML informa no pedido."
      >
        <Input
          id="tax-rate"
          name="taxRatePct"
          inputMode="decimal"
          defaultValue={value ? String(value).replace('.', ',') : ''}
          placeholder="0"
          className="max-w-32"
        />
      </Field>
      <div>
        <SubmitButton size="sm" variant="secondary">
          Salvar alíquota
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

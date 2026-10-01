'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select } from '@/components/ui/primitives'
import { saveEngineSettings } from '@/lib/actions/memory'
import { saveFeeRule } from '@/lib/actions/products'

const ENGINE_FIELDS: { name: string; label: string; hint?: string }[] = [
  { name: 'dailyTarget', label: 'Meta diária (R$)' },
  { name: 'minMarginPct', label: 'Margem mínima (%)', hint: 'Abaixo disso: alerta crítico.' },
  { name: 'targetMarginPct', label: 'Margem alvo (%)', hint: 'Usada no preço sugerido.' },
  { name: 'daysWithoutSale', label: 'Dias sem venda', hint: 'Para produtos de giro.' },
  { name: 'windowDays', label: 'Janela de análise (dias)' },
  { name: 'minVisitsForConversion', label: 'Visitas mínimas p/ conversão' },
  { name: 'highTrafficVisits', label: 'Visitas = tráfego alto' },
  { name: 'lowConversionPct', label: 'Conversão baixa (%)' },
  { name: 'healthyConversionPct', label: 'Conversão saudável (%)' },
  { name: 'significantChangePct', label: 'Variação significativa (%)' },
  { name: 'minOrdersHistory', label: 'Pedidos mínimos no histórico' },
  { name: 'minHistoryDays', label: 'Dias mínimos de histórico' },
]

export function EngineSettingsForm({ values }: { values: Record<string, number> }) {
  return (
    <ActionForm action={saveEngineSettings}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENGINE_FIELDS.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={f.name} hint={f.hint}>
            <Input id={f.name} name={f.name} inputMode="decimal" required defaultValue={values[f.name]} />
          </Field>
        ))}
      </div>
      <div>
        <SubmitButton>Salvar parâmetros</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function FeeRuleForm({ marketplaces, today }: { marketplaces: { id: string; name: string }[]; today: string }) {
  return (
    <ActionForm action={saveFeeRule} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marketplace" htmlFor="fr-mk">
          <Select id="fr-mk" name="marketplaceId">
            {marketplaces.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" htmlFor="fr-name">
          <Input id="fr-name" name="name" required placeholder="Clássico · acima de R$ 79" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Comissão (%)" htmlFor="fr-pct">
          <Input id="fr-pct" name="percentageFee" inputMode="decimal" required />
        </Field>
        <Field label="Tarifa fixa (R$)" htmlFor="fr-fix">
          <Input id="fr-fix" name="fixedFee" inputMode="decimal" defaultValue="0" />
        </Field>
        <Field label="Adicional (%)" htmlFor="fr-apct">
          <Input id="fr-apct" name="additionalFeePct" inputMode="decimal" defaultValue="0" />
        </Field>
        <Field label="Adicional (R$)" htmlFor="fr-afix">
          <Input id="fr-afix" name="additionalFixedFee" inputMode="decimal" defaultValue="0" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Preço mín. (R$)" htmlFor="fr-min">
          <Input id="fr-min" name="minPrice" inputMode="decimal" />
        </Field>
        <Field label="Preço máx. (R$)" htmlFor="fr-max">
          <Input id="fr-max" name="maxPrice" inputMode="decimal" />
        </Field>
        <Field label="Categoria" htmlFor="fr-cat" hint="Vazio = todas.">
          <Input id="fr-cat" name="category" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Vigente desde" htmlFor="fr-from">
          <Input id="fr-from" name="effectiveFrom" type="date" required defaultValue={today} />
        </Field>
        <Field label="Vigente até" htmlFor="fr-to">
          <Input id="fr-to" name="effectiveTo" type="date" />
        </Field>
        <Field label="Observações" htmlFor="fr-notes">
          <Input id="fr-notes" name="notes" />
        </Field>
      </div>
      <div>
        <SubmitButton variant="secondary" size="sm">Adicionar regra</SubmitButton>
      </div>
    </ActionForm>
  )
}

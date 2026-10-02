'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select } from '@/components/ui/primitives'
import { saveEngineSettings } from '@/lib/actions/memory'
import { saveFeeRule } from '@/lib/actions/products'

const ENGINE_FIELDS: { name: string; label: string; hint?: string }[] = [
  { name: 'dailyTarget', label: 'Meta diária (R$)' },
  { name: 'minMarginPct', label: 'Margem mínima (%)', hint: 'Abaixo disso: alerta crítico.' },
  { name: 'targetMarginPct', label: 'Margem alvo (%)', hint: 'Usada no preço sugerido.' },
  { name: 'daysWithoutSale', label: 'Dias sem venda (piso)', hint: 'Piso mínimo. O motor usa o ritmo normal de cada produto e a classificação.' },
  { name: 'windowDays', label: 'Janela de análise (dias)', hint: 'Triplicada para alto ticket e sazonal.' },
  { name: 'minVisitsForConversion', label: 'Visitas mínimas p/ conversão', hint: 'Amostra mínima para julgar conversão.' },
  { name: 'highTrafficVisits', label: 'Visitas = tráfego alto', hint: 'Amostra exigida para produtos de margem e alto ticket.' },
  { name: 'lowConversionPct', label: 'Conversão baixa (%)', hint: 'Só é usado como sinal fraco quando o produto ainda não tem base própria.' },
  { name: 'healthyConversionPct', label: 'Conversão saudável (%)', hint: 'Referência geral; o motor prioriza a base do produto.' },
  { name: 'significantChangePct', label: 'Variação significativa (%)', hint: 'Desvio frente à base histórica do próprio produto.' },
  { name: 'minOrdersHistory', label: 'Pedidos mínimos no histórico', hint: 'Abaixo disso a evidência é tratada como fraca.' },
  { name: 'minHistoryDays', label: 'Dias mínimos de histórico', hint: 'Antes disso: dados insuficientes, sem recomendação.' },
  { name: 'stockRiskDays', label: 'Zona de risco de ruptura (dias de cobertura)', hint: 'Cobertura = estoque ÷ velocidade de venda. Quantidade isolada não gera alerta.' },
  { name: 'stockCriticalDays', label: 'Ruptura iminente (dias de cobertura)', hint: 'Abaixo disso, produto relevante vira Alto impacto.' },
  { name: 'competitivePriceGapPct', label: 'Diferença relevante vs concorrente (%)', hint: 'Abaixo disso, a diferença de preço é ignorada.' },
  { name: 'competitorFreshDays', label: 'Validade da observação de concorrente (dias)', hint: 'Observações mais antigas não entram na análise.' },
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

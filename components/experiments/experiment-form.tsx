'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { VARIABLE_LABEL } from '@/components/ui/badges'
import { createExperiment } from '@/lib/actions/experiments'

export type ChannelOption = { id: string; label: string; price: string }

export function ExperimentForm({ channels, today, defaultChannel }: { channels: ChannelOption[]; today: string; defaultChannel?: string }) {
  const evaluation = new Date(`${today}T12:00:00`)
  evaluation.setDate(evaluation.getDate() + 7)
  const evalISO = evaluation.toISOString().slice(0, 10)

  return (
    <ActionForm action={createExperiment} className="max-w-2xl">
      <Field label="Produto / canal" htmlFor="productChannelId">
        <Select id="productChannelId" name="productChannelId" required defaultValue={defaultChannel ?? ''}>
          <option value="" disabled>Selecione…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Variável testada" htmlFor="variable">
          <Select id="variable" name="variable" defaultValue="price">
            {Object.entries(VARIABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Valor anterior" htmlFor="previousValue">
          <Input id="previousValue" name="previousValue" required placeholder="R$ 459,90" />
        </Field>
        <Field label="Novo valor" htmlFor="newValue">
          <Input id="newValue" name="newValue" required placeholder="R$ 439,90" />
        </Field>
      </div>
      <Field label="Hipótese" htmlFor="hypothesis" hint="O que você espera que aconteça e por quê.">
        <Textarea id="hypothesis" name="hypothesis" required placeholder="Reduzir o preço para abaixo de R$ 440 deve aumentar a conversão sem derrubar a margem abaixo de 12%." />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Início" htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" required defaultValue={today} />
        </Field>
        <Field label="Avaliação" htmlFor="evaluationDate">
          <Input id="evaluationDate" name="evaluationDate" type="date" required defaultValue={evalISO} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Métrica principal" htmlFor="primaryMetric">
          <Input id="primaryMetric" name="primaryMetric" required defaultValue="Conversão" />
        </Field>
        <Field label="Métricas secundárias" htmlFor="secondaryMetrics" hint="Separadas por vírgula.">
          <Input id="secondaryMetrics" name="secondaryMetrics" defaultValue="Pedidos, Margem, Visitas" />
        </Field>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        O ALURE OS não altera nada no marketplace. Aplique a mudança manualmente e registre aqui para que o motor acompanhe.
      </p>
      <div>
        <SubmitButton>Criar teste</SubmitButton>
      </div>
    </ActionForm>
  )
}

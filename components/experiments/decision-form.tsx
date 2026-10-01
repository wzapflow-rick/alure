'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Select, Textarea } from '@/components/ui/primitives'
import { DECISION_LABEL } from '@/components/ui/badges'
import { decideExperiment } from '@/lib/actions/experiments'

export function DecisionForm({ id, suggested }: { id: string; suggested: string | null }) {
  return (
    <ActionForm action={decideExperiment}>
      <input type="hidden" name="id" value={id} />
      <Field label="Decisão" htmlFor="decision">
        <Select id="decision" name="decision" defaultValue={suggested ?? 'keep'}>
          {Object.entries(DECISION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}{k === suggested ? ' (sugerido)' : ''}</option>
          ))}
        </Select>
      </Field>
      <Field label="Resultado observado" htmlFor="result">
        <Textarea id="result" name="result" required placeholder="Conversão subiu de 1,1% para 1,6% com margem estável." />
      </Field>
      <Field label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="saveToMemory" defaultChecked className="accent-primary" />
        Registrar na memória estratégica
      </label>
      <div>
        <SubmitButton>Registrar decisão</SubmitButton>
      </div>
    </ActionForm>
  )
}

'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { addMemory } from '@/lib/actions/memory'

export function MemoryForm({ today, products }: { today: string; products: { id: string; name: string }[] }) {
  return (
    <ActionForm action={addMemory} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data" htmlFor="memoryDate">
          <Input id="memoryDate" name="memoryDate" type="date" required defaultValue={today} />
        </Field>
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="decision">
            <option value="decision">Decisão</option>
            <option value="rule">Regra</option>
            <option value="context">Contexto</option>
          </Select>
        </Field>
      </div>
      <Field label="Produto (opcional)" htmlFor="productId">
        <Select id="productId" name="productId" defaultValue="">
          <option value="">Geral</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Assunto" htmlFor="subject">
        <Input id="subject" name="subject" required />
      </Field>
      <Field label="Decisão" htmlFor="decision">
        <Textarea id="decision" name="decision" required />
      </Field>
      <Field label="Motivo" htmlFor="reason">
        <Textarea id="reason" name="reason" />
      </Field>
      <Field label="Resultado esperado" htmlFor="expectedResult">
        <Input id="expectedResult" name="expectedResult" />
      </Field>
      <div>
        <SubmitButton>Registrar</SubmitButton>
      </div>
    </ActionForm>
  )
}

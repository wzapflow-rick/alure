'use client'

import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Select } from '@/components/ui/primitives'
import { createReminder } from '@/lib/actions/notifications'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7)

export function ReminderForm() {
  return (
    <ActionForm action={createReminder} resetOnSuccess className="px-5 py-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Lembrete" htmlFor="reminder-title">
          <Input id="reminder-title" name="title" required placeholder="Ex.: Revisar fotos dos anúncios novos" />
        </Field>
        <Field label="Detalhe (opcional)" htmlFor="reminder-message">
          <Input id="reminder-message" name="message" placeholder="O que exatamente precisa ser feito" />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Dias</legend>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((day, i) => (
              <label
                key={day}
                className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-foreground"
              >
                <input type="checkbox" name="weekdays" value={i} defaultChecked={i >= 1 && i <= 5} className="sr-only" />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Horário" htmlFor="reminder-hour">
          <Select id="reminder-hour" name="hour" defaultValue="9" className="w-28">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton>Adicionar lembrete</SubmitButton>
      </div>
    </ActionForm>
  )
}

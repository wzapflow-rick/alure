import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Field, Input, Textarea } from '@/components/ui/primitives'
import { advanceRecommendation } from '@/lib/actions/decisions'
import { nextSteps, STATUS_LABEL, type RecStatus } from '@/lib/engine/lifecycle'
import { formatDate, todayISO } from '@/lib/format'
import type { RecommendationRow } from '@/lib/queries'

const TEAM = ['Riquelmo', 'Marcela', 'Dudu']
const FIELD = 'h-11 text-base md:text-sm'

function Hidden({ id, to }: { id: string; to: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
    </>
  )
}

/** Records who executed, when, and what was learned. Never changes anything in the marketplace. */
export function ExecutionPanel({ rec }: { rec: RecommendationRow }) {
  const steps = nextSteps(rec.status)
  const today = todayISO()
  const listId = `team-${rec.id}`
  const facts = [
    { label: 'Status', value: STATUS_LABEL[rec.status as RecStatus] ?? rec.status },
    { label: 'Responsável', value: rec.owner },
    { label: 'Aprovada em', value: rec.approved_at ? formatDate(rec.approved_at) : null },
    { label: 'Executada em', value: rec.executed_at ? formatDate(rec.executed_at) : null },
    { label: 'Avaliar em', value: rec.review_date ? formatDate(rec.review_date) : null },
  ].filter((f) => f.value)

  return (
    <section aria-label="Execução e resultado" className="flex flex-col gap-5 border-t border-border pt-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
            <dd className="text-sm">{f.value}</dd>
          </div>
        ))}
      </dl>

      {rec.execution_note ? (
        <p className="text-sm leading-relaxed text-pretty">
          <span className="text-muted-foreground">O que foi feito: </span>
          {rec.execution_note}
        </p>
      ) : null}

      {rec.outcome ? (
        <div className="flex flex-col gap-1 rounded-md bg-background/60 px-4 py-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Resultado observado</span>
          <p className="text-sm leading-relaxed text-pretty">{rec.outcome}</p>
        </div>
      ) : rec.status === 'awaiting_review' ? (
        <p className="text-sm text-muted-foreground">
          A medição antes × depois sai automaticamente na análise de {rec.review_date ? formatDate(rec.review_date) : 'fim do período'}.
        </p>
      ) : null}

      {rec.learning ? (
        <p className="text-sm leading-relaxed text-pretty">
          <span className="text-muted-foreground">Aprendizado: </span>
          {rec.learning}
        </p>
      ) : null}

      <datalist id={listId}>
        {TEAM.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {steps.includes('awaiting_review') ? (
        <ActionForm action={advanceRecommendation} className="gap-3">
          <input type="hidden" name="id" value={rec.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Responsável" htmlFor={`owner-${rec.id}`}>
              <Input id={`owner-${rec.id}`} name="owner" list={listId} defaultValue={rec.owner ?? ''} required autoComplete="off" className={FIELD} />
            </Field>
            <Field label="Executada em" htmlFor={`exec-${rec.id}`}>
              <Input id={`exec-${rec.id}`} name="executed_at" type="date" max={today} min={rec.approved_at ?? undefined} defaultValue={today} required className={FIELD} />
            </Field>
          </div>
          <Field label="O que foi feito" htmlFor={`note-${rec.id}`} hint="Opcional. Ex.: preço de R$ 89,90 para R$ 84,90.">
            <Textarea id={`note-${rec.id}`} name="note" defaultValue={rec.execution_note ?? ''} className="text-base md:text-sm" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="primary" className="h-11" name="to" value="awaiting_review">
              Registrar execução
            </SubmitButton>
            {steps.includes('in_progress') ? (
              <SubmitButton variant="secondary" className="h-11" name="to" value="in_progress" formNoValidate>
                Ainda em execução
              </SubmitButton>
            ) : null}
          </div>
        </ActionForm>
      ) : null}

      {steps.includes('completed') ? (
        <ActionForm action={advanceRecommendation} className="gap-3">
          <Hidden id={rec.id} to="completed" />
          <Field label="Resultado e aprendizado" htmlFor={`learn-${rec.id}`} hint="Descreva o que mudou e o que outros fatores podem ter influenciado.">
            <Textarea id={`learn-${rec.id}`} name="learning" required className="text-base md:text-sm" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="primary" className="h-11">Concluir</SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {steps.includes('cancelled') ? (
        <ActionForm action={advanceRecommendation} className="gap-2">
          <Hidden id={rec.id} to="cancelled" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="ghost" className="h-11">Cancelar ação</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </section>
  )
}

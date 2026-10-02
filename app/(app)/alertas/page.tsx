import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, SEVERITY_LABEL, severityTone } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { RunEngineButton } from '@/components/decisions/run-engine-button'
import { updateAlert } from '@/lib/actions/decisions'
import { formatDateTime } from '@/lib/format'
import { listAlerts } from '@/lib/queries'

export const metadata: Metadata = { title: 'Alertas' }

const ALERT_TYPE_LABEL: Record<string, string> = {
  mix_risk: 'Risco de mix',
  concentration: 'Dependência de produto',
  revenue_motor_absent: 'Motor de faturamento ausente',
  pace_drop: 'Motor de giro desacelerando',
  systemic_motors: 'Motor de giro desacelerando',
}

export default async function AlertsPage() {
  const alerts = await listAlerts()
  return (
    <>
      <PageHeader
        title="Alertas"
        description="Gerados pelo motor a partir de regras determinísticas. Resolvidos somem até a condição voltar. Descartados só reaparecem se a gravidade aumentar."
        action={<RunEngineButton />}
      />
      <Panel>
        {alerts.length ? (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(a.severity)}>{SEVERITY_LABEL[a.severity] ?? a.severity}</Badge>
                    {ALERT_TYPE_LABEL[a.alert_type] ? <Badge>{ALERT_TYPE_LABEL[a.alert_type]}</Badge> : null}
                    {a.status === 'acknowledged' ? <Badge>Ciente</Badge> : null}
                    <span className="font-mono text-[11px] text-muted-foreground">{formatDateTime(a.updated_at)}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-pretty">{a.message}</p>
                  <div className="flex gap-3 text-xs">
                    {a.product_id ? <Link href={`/produtos/${a.product_id}`} className="text-primary hover:underline">Ver produto</Link> : null}
                    {a.experiment_id ? <Link href={`/testes/${a.experiment_id}`} className="text-primary hover:underline">Ver teste</Link> : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {a.status === 'open' ? <InlineAction action={updateAlert} fields={{ id: a.id, status: 'acknowledged' }} label="Ciente" /> : null}
                  <InlineAction action={updateAlert} fields={{ id: a.id, status: 'resolved' }} label="Resolver" variant="secondary" />
                  <InlineAction action={updateAlert} fields={{ id: a.id, status: 'dismissed' }} label="Descartar" variant="secondary" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhum alerta aberto." />
        )}
      </Panel>
    </>
  )
}

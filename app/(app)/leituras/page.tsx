import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { listAnalysisRuns } from '@/lib/analysis'
import { formatBRL, formatDate, formatDateTime, formatInt } from '@/lib/format'
import { listDailySummaries } from '@/lib/queries'

export const metadata: Metadata = { title: 'Leituras diárias' }

const TRIGGER_LABEL: Record<string, string> = {
  sync: 'Após sincronização',
  scheduled: 'Agendada',
  on_open: 'Ao abrir',
  manual: 'Manual',
}

export default async function ReadingsPage() {
  const [summaries, runs] = await Promise.all([listDailySummaries(60), listAnalysisRuns(30)])

  return (
    <>
      <PageHeader
        title="Leituras diárias"
        description="O que o sistema concluiu em cada dia e o registro de cada análise executada."
      />
      <div className="grid gap-8 lg:grid-cols-3">
        <Panel title="Leituras" className="lg:col-span-2">
          {summaries.length ? (
            <ol className="divide-y divide-border">
              {summaries.map((s) => (
                <li key={s.summary_date} className="flex flex-col gap-1.5 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground tabular">{formatDate(s.summary_date)}</span>
                    {s.revenue !== null ? (
                      <span className="font-mono text-xs text-muted-foreground tabular">
                        {formatBRL(s.revenue)} · {formatInt(s.orders ?? 0)} ped.
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-relaxed text-pretty">{s.summary ?? 'Leitura no formato anterior.'}</p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nenhuma leitura gerada ainda." />
          )}
        </Panel>

        <Panel title="Execuções da análise">
          {runs.length ? (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground tabular">{formatDateTime(r.started_at)}</span>
                    <Badge tone={r.status === 'success' ? 'positive' : r.status === 'error' ? 'critical' : 'neutral'}>
                      {r.status === 'success' ? 'Concluída' : r.status === 'error' ? 'Erro' : 'Rodando'}
                    </Badge>
                  </div>
                  <span className="text-sm">{TRIGGER_LABEL[r.trigger] ?? r.trigger}</span>
                  {r.status === 'error' ? (
                    <span className="text-xs leading-relaxed text-muted-foreground">{r.error}</span>
                  ) : (
                    <span className="font-mono text-[11px] text-muted-foreground tabular">
                      {r.channels_analyzed} canais · {r.created} novas · {r.resolved} resolvidas · {r.protected_by_tests} protegidas
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma execução registrada." />
          )}
        </Panel>
      </div>
    </>
  )
}

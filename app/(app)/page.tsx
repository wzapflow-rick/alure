import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Badge, Dot, EXPERIMENT_STATUS_LABEL, VARIABLE_LABEL, experimentTone } from '@/components/ui/badges'
import { EmptyState, Panel } from '@/components/ui/primitives'
import { RecommendationCard } from '@/components/decisions/recommendation-card'
import { RunEngineButton } from '@/components/decisions/run-engine-button'
import { formatBRL, formatDateTime, formatInt, formatLongToday, formatPct, formatTestCode } from '@/lib/format'
import {
  getChannelPerformance,
  getConnections,
  getDailySummary,
  getTodayKpis,
  listExperiments,
  listMemory,
  listRecommendations,
} from '@/lib/queries'
import { getEngineSettings } from '@/lib/settings'
import { getSessionUser } from '@/lib/session'

export default async function CommandPage() {
  const settings = await getEngineSettings()
  const [user, kpis, brief, connections, channels, priorities, opportunities, experiments, memory] = await Promise.all([
    getSessionUser(),
    getTodayKpis(),
    getDailySummary(),
    getConnections(),
    getChannelPerformance(settings.windowDays),
    listRecommendations({ kinds: ['priority', 'test_review'], statuses: ['open'], limit: 3 }),
    listRecommendations({ kinds: ['opportunity'], statuses: ['open'], limit: 3 }),
    listExperiments({ statuses: ['in_progress', 'ready_for_review', 'planned'] }),
    listMemory({ limit: 4, status: 'active' }),
  ])

  const progress = settings.dailyTarget > 0 ? Math.min(100, (kpis.revenue / settings.dailyTarget) * 100) : 0
  const firstName = user?.name?.split(' ')[0]

  return (
    <>
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{formatLongToday()}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {firstName ? `Bom dia, ${firstName}.` : 'Central de comando.'}
          </h1>
        </div>
        <RunEngineButton />
      </header>

      <section aria-label="Resumo do dia" className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-5 py-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Leitura de hoje</h2>
        {brief ? (
          <ul className="flex flex-col gap-2">
            {brief.content.lines.map((l, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm leading-relaxed">
                <Dot tone={l.tone} />
                <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{l.label}</span>
                <span className="text-pretty">{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            A leitura de hoje ainda não foi gerada. Clique em <span className="text-foreground">Rodar análise</span>.
          </p>
        )}
      </section>

      <section aria-label="Indicadores de hoje" className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        <div className="flex flex-col gap-3 bg-surface px-5 py-5 md:col-span-2">
          <span className="text-xs text-muted-foreground">Faturamento hoje</span>
          {kpis.hasData ? (
            <>
              <span className="text-4xl font-semibold tracking-tight tabular">{formatBRL(kpis.revenue)}</span>
              <div className="flex flex-col gap-1.5">
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta diária">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground tabular">
                  {formatPct((kpis.revenue / Math.max(1, settings.dailyTarget)) * 100)} da meta · {formatBRL(settings.dailyTarget)}
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm leading-relaxed text-muted-foreground">Sem dados de vendas sincronizados.</span>
          )}
        </div>
        <div className="flex flex-col gap-3 bg-surface px-5 py-5">
          <span className="text-xs text-muted-foreground">Pedidos</span>
          <span className="text-2xl font-semibold tabular">{kpis.hasData ? formatInt(kpis.orders) : '—'}</span>
        </div>
        <div className="flex flex-col gap-3 bg-surface px-5 py-5">
          <span className="text-xs text-muted-foreground">Ticket médio</span>
          <span className="text-2xl font-semibold tabular">{kpis.aov !== null ? formatBRL(kpis.aov) : '—'}</span>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <Panel
          title="Prioridades do dia"
          className="lg:col-span-2"
          action={
            <Link href="/prioridades" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Ver todas <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          }
        >
          {priorities.length ? (
            <div className="divide-y divide-border">
              {priorities.map((r, i) => (
                <RecommendationCard key={r.id} rec={r} rank={i + 1} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhuma prioridade aberta."
              description="O motor só gera prioridades quando há histórico suficiente e um sinal acima dos limites configurados."
            />
          )}
        </Panel>

        <div className="flex flex-col gap-8">
          <Panel title="Canais">
            {connections.length ? (
              <ul className="divide-y divide-border">
                {connections.map((c) => {
                  const perf = channels.find((p) => p.marketplace_id === c.marketplace_id)
                  const change =
                    perf && Number(perf.revenue_prev) > 0
                      ? ((Number(perf.revenue_cur) - Number(perf.revenue_prev)) / Number(perf.revenue_prev)) * 100
                      : null
                  return (
                    <li key={c.marketplace_id} className="flex flex-col gap-1 px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{c.name}</span>
                        <Badge tone={c.status === 'connected' ? 'positive' : c.status === 'error' || c.status === 'expired' ? 'critical' : 'neutral'}>
                          {c.status === 'connected' ? 'Conectado' : c.status === 'error' ? 'Erro' : c.status === 'expired' ? 'Expirado' : 'Não conectado'}
                        </Badge>
                      </div>
                      {perf ? (
                        <span className="font-mono text-[11px] text-muted-foreground tabular">
                          {settings.windowDays}d · {formatBRL(perf.revenue_cur)} · {formatInt(perf.orders_cur)} ped.
                          {change !== null ? ` · ${formatPct(change, true)}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {c.last_sync ? `Última sync ${formatDateTime(c.last_sync)}` : 'Sem dados'}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="Nenhum marketplace cadastrado." />
            )}
          </Panel>

          <Panel
            title="Testes"
            action={
              <Link href="/testes" className="text-xs text-muted-foreground hover:text-foreground">
                Ver
              </Link>
            }
          >
            {experiments.length ? (
              <ul className="divide-y divide-border">
                {experiments.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link href={`/testes/${e.id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-surface-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{formatTestCode(e.id)}</span>
                        <Badge tone={experimentTone(e.status)}>{EXPERIMENT_STATUS_LABEL[e.status]}</Badge>
                      </div>
                      <span className="truncate text-sm">{e.product_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {VARIABLE_LABEL[e.variable]} · avaliação {e.evaluation_date.split('-').reverse().join('/')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nenhum teste ativo." />
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Panel
          title="Oportunidades"
          className="lg:col-span-2"
          action={
            <Link href="/oportunidades" className="text-xs text-muted-foreground hover:text-foreground">
              Ver todas
            </Link>
          }
        >
          {opportunities.length ? (
            <div className="divide-y divide-border">
              {opportunities.map((r) => (
                <RecommendationCard key={r.id} rec={r} compact />
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhuma oportunidade identificada." />
          )}
        </Panel>

        <Panel
          title="Memória recente"
          action={
            <Link href="/memoria" className="text-xs text-muted-foreground hover:text-foreground">
              Ver
            </Link>
          }
        >
          {memory.length ? (
            <ul className="divide-y divide-border">
              {memory.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 px-5 py-3">
                  <span className="font-mono text-[11px] text-muted-foreground">{m.memory_date.split('-').reverse().join('/')}</span>
                  <span className="text-sm">{m.subject}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{m.decision}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma decisão registrada." />
          )}
        </Panel>
      </div>
    </>
  )
}

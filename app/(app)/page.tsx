import Link from 'next/link'
import { after } from 'next/server'
import { ArrowUpRight } from 'lucide-react'
import { DailyBriefPanel } from '@/components/command/daily-brief'
import { AIReadingPanel } from '@/components/command/ai-reading'
import { getLatestAnalysis, getRunningAnalysis, isStale, runAnalysis } from '@/lib/analysis'
import { Badge, EXPERIMENT_STATUS_LABEL, VARIABLE_LABEL, experimentTone } from '@/components/ui/badges'
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
import type { CommercialStatus } from '@/lib/engine/run'
import type { Tone } from '@/components/ui/badges'

const COMMERCIAL_LABEL: Record<CommercialStatus, string> = {
  healthy: 'Saudável',
  attention: 'Atenção',
  critical: 'Crítico',
  insufficient_data: 'Dados insuficientes',
}

const COMMERCIAL_TONE: Record<CommercialStatus, Tone> = {
  healthy: 'positive',
  attention: 'attention',
  critical: 'critical',
  insufficient_data: 'neutral',
}

export default async function CommandPage() {
  const [settings, latest, running, user] = await Promise.all([
    getEngineSettings(),
    getLatestAnalysis(),
    getRunningAnalysis(),
    getSessionUser(),
  ])
  const stale = isStale(latest)
  if (stale && !running) {
    after(() => runAnalysis('on_open', user).catch(() => undefined))
  }
  const analyzing = Boolean(running) || stale

  const [kpis, brief, connections, channels, priorities, opportunities, experiments, memory] = await Promise.all([
    getTodayKpis(),
    getDailySummary(),
    getConnections(),
    getChannelPerformance(settings.windowDays),
    listRecommendations({ kinds: ['priority', 'test_review'], statuses: ['open'], limit: 3 }),
    listRecommendations({ kinds: ['opportunity'], statuses: ['open'], limit: 3 }),
    listExperiments({ statuses: ['ready_for_review', 'in_progress'] }),
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

      <DailyBriefPanel brief={brief?.content ?? null} latest={latest} analyzing={analyzing} />

      <AIReadingPanel block={brief?.content?.ai} />

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
          <Panel title="Saúde da operação">
            {connections.length ? (
              <ul className="divide-y divide-border">
                {connections.map((c) => {
                  const perf = channels.find((p) => p.marketplace_id === c.marketplace_id)
                  const health = latest?.health?.find((h) => h.marketplaceId === Number(c.marketplace_id))
                  const connected = c.status === 'connected'
                  const commercial = connected ? (health?.status ?? 'insufficient_data') : null
                  const lastSync = health?.lastSuccessfulSync ?? c.last_sync
                  const change =
                    perf && Number(perf.revenue_prev) > 0
                      ? ((Number(perf.revenue_cur) - Number(perf.revenue_prev)) / Number(perf.revenue_prev)) * 100
                      : null
                  return (
                    <li key={c.marketplace_id} className="flex flex-col gap-1.5 px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{c.name}</span>
                        {commercial ? (
                          <Badge tone={COMMERCIAL_TONE[commercial]}>{COMMERCIAL_LABEL[commercial]}</Badge>
                        ) : (
                          <Badge tone={c.status === 'error' || c.status === 'expired' ? 'critical' : 'neutral'}>
                            {c.status === 'error' ? 'Erro de conexão' : c.status === 'expired' ? 'Conexão expirada' : 'Não conectado'}
                          </Badge>
                        )}
                      </div>
                      {connected ? (
                        <>
                          {health?.reason ? <span className="text-xs leading-relaxed text-muted-foreground">{health.reason}</span> : null}
                          <span className="font-mono text-[11px] text-muted-foreground tabular">
                            {lastSync ? `Última sync ${formatDateTime(lastSync)}` : 'Nenhuma sync concluída'}
                            {perf ? ` · ${settings.windowDays}d ${formatBRL(perf.revenue_cur)} · ${formatInt(perf.orders_cur)} ped.` : ''}
                            {change !== null ? ` · ${formatPct(change, true)}` : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{c.name} ainda não conectado.</span>
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
              <EmptyState title="Nenhum teste em acompanhamento." />
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

import Link from 'next/link'
import { after } from 'next/server'
import { getLatestAnalysis, getRunningAnalysis, isStale, runAnalysis } from '@/lib/analysis'
import { RecommendationCard } from '@/components/decisions/recommendation-card'
import { RunEngineButton } from '@/components/decisions/run-engine-button'
import { DayReading } from '@/components/command/day-reading'
import { KpiStrip } from '@/components/command/kpi-strip'
import { OpportunityStrip } from '@/components/command/opportunity-strip'
import { AttentionBox, type AttentionLine } from '@/components/command/attention-box'
import { ChannelHealth, TestsMini, type ChannelHealthItem } from '@/components/command/side-lists'
import { SearchTrigger } from '@/components/shell/command-palette'
import { TIMEZONE } from '@/lib/format'
import {
  getConnections,
  getDailySummary,
  getTodayKpis,
  listAlerts,
  listExperiments,
  listProductIndex,
  listRecommendations,
} from '@/lib/queries'
import { getEngineSettings } from '@/lib/settings'
import { getSessionUser } from '@/lib/session'
import type { CommercialStatus } from '@/lib/engine/run'
import type { Tone } from '@/components/ui/badges'

const COMMERCIAL: Record<CommercialStatus, { label: string; tone: Tone }> = {
  healthy: { label: 'Saudável', tone: 'positive' },
  attention: { label: 'Atenção', tone: 'attention' },
  critical: { label: 'Crítico', tone: 'critical' },
  insufficient_data: { label: 'Dados insuficientes', tone: 'neutral' },
}

function commandDate() {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month').replace('.', '').toUpperCase()} ${get('year')}`
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

  const [kpis, brief, connections, priorities, opportunities, experiments, alerts, productIndex] = await Promise.all([
    getTodayKpis(),
    getDailySummary(),
    getConnections(),
    listRecommendations({ kinds: ['priority', 'test_review'], statuses: ['open'], limit: 3 }),
    listRecommendations({ kinds: ['opportunity'], statuses: ['open'], limit: 50 }),
    listExperiments({ statuses: ['ready_for_review', 'in_progress'] }),
    listAlerts(['open'], 50),
    listProductIndex(),
  ])

  const channelHealth: ChannelHealthItem[] = connections.map((c) => {
    const health = latest?.health?.find((h) => h.marketplaceId === Number(c.marketplace_id))
    if (c.status !== 'connected') {
      const broken = c.status === 'error' || c.status === 'expired'
      return {
        id: String(c.marketplace_id),
        name: c.name,
        tone: broken ? 'critical' : 'neutral',
        label: c.status === 'error' ? 'Erro de conexão' : c.status === 'expired' ? 'Conexão expirada' : 'Não conectado',
        detail: null,
        lastSync: null,
      }
    }
    const status = COMMERCIAL[health?.status ?? 'insufficient_data']
    return {
      id: String(c.marketplace_id),
      name: c.name,
      tone: status.tone,
      label: status.label,
      detail: health?.reason ?? null,
      lastSync: health?.lastSuccessfulSync ?? c.last_sync,
    }
  })

  const firstName = user?.name?.split(' ')[0]

  const skuByProduct = new Map(productIndex.map((p) => [String(p.id), p.sku]))
  const priorityProducts = new Set(priorities.map((r) => r.product_id).filter(Boolean).map(String))
  const mixAlerts = alerts.filter((a) => a.alert_type === 'mix_risk')
  const attention: AttentionLine[] = alerts
    .filter((a) => a.alert_type !== 'mix_risk')
    .filter((a) => a.severity === 'critical' || a.severity === 'attention')
    .filter((a) => !a.product_id || !priorityProducts.has(String(a.product_id)))
    .map((a) => ({
      id: a.id,
      severity: a.severity,
      sku: a.product_id ? skuByProduct.get(String(a.product_id)) ?? null : null,
      message: a.message,
      href: a.product_id ? `/produtos/${a.product_id}` : a.experiment_id ? `/testes/${a.experiment_id}` : '/alertas',
    }))
  const otherOpportunities = opportunities.filter((r) => !r.product_id || !priorityProducts.has(String(r.product_id)))

  return (
    <>
      <header className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="eyebrow tabular">{commandDate()}</p>
          <h1 className="text-[28px] font-semibold tracking-tight text-balance md:text-[34px]">
            {firstName ? `Bom dia, ${firstName}.` : 'Central de comando.'}
          </h1>
        </div>
        <div className="flex items-center gap-3 md:pt-1">
          <SearchTrigger className="w-full md:w-80" />
          <RunEngineButton />
        </div>
      </header>

      <KpiStrip kpis={kpis} dailyTarget={settings.dailyTarget} />

      <div className="rule" aria-hidden />

      <DayReading brief={brief?.content ?? null} latest={latest} analyzing={analyzing} />

      {mixAlerts.length ? (
        <section aria-label="Risco de mix" className="flex flex-col gap-3 border-y border-border py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="eyebrow">Risco de mix</p>
            {mixAlerts.map((a) => (
              <p key={a.id} className="text-sm leading-relaxed text-pretty">{a.message}</p>
            ))}
          </div>
          <Link
            href="/alertas"
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-secondary"
          >
            Investigar mix
          </Link>
        </section>
      ) : null}

      <section aria-label="Prioridades" className="flex flex-col gap-2">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="eyebrow tabular">
            Prioridades · <span className="text-foreground">{priorities.length}</span>
          </h2>
          <Link href="/prioridades" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Ver todas
          </Link>
        </header>
        {priorities.length ? (
          <div className="divide-y divide-border border-y border-border">
            {priorities.map((r, i) => (
              <RecommendationCard key={r.id} rec={r} rank={i + 1} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-sm leading-relaxed text-muted-foreground">
            Nenhuma prioridade aberta. O motor só gera prioridades com histórico suficiente e sinal acima dos limites.
          </p>
        )}
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <AttentionBox lines={attention} total={attention.length} />
        <TestsMini experiments={experiments} />
      </div>

      <OpportunityStrip items={otherOpportunities.slice(0, 3)} total={otherOpportunities.length} />

      <div className="rule" aria-hidden />

      <ChannelHealth items={channelHealth} />
    </>
  )
}

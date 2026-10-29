import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
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
      <header className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{commandDate()}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-[32px]">
            {firstName ? `${greeting()}, ${firstName}.` : 'Central de comando.'}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SearchTrigger className="hidden lg:flex lg:w-72" />
          <RunEngineButton />
        </div>
      </header>

      <div className="flex flex-col gap-4 md:gap-5">
        <KpiStrip kpis={kpis} dailyTarget={settings.dailyTarget} />
        <DayReading brief={brief?.content ?? null} latest={latest} analyzing={analyzing} />
      </div>

      {mixAlerts.length ? (
        <section aria-label="Risco de mix" className="flex flex-col gap-3 rounded-2xl border border-attention/30 bg-attention/5 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-attention">Risco de mix</p>
            {mixAlerts.map((a) => (
              <p key={a.id} className="text-sm leading-relaxed text-pretty">{a.message}</p>
            ))}
          </div>
          <Link
            href="/alertas"
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-attention/30 bg-surface px-3 text-sm font-medium text-attention transition-colors hover:bg-attention/10"
          >
            Investigar mix
          </Link>
        </section>
      ) : null}

      <section aria-label="Prioridades" className="flex flex-col gap-4">
        <header className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              Prioridades
              <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background tabular">{priorities.length}</span>
            </h2>
            <p className="text-sm text-muted-foreground">O que decidir primeiro hoje.</p>
          </div>
          <Link
            href="/prioridades"
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Ver todas
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </header>
        {priorities.length ? (
          <div className="flex flex-col gap-3">
            {priorities.map((r, i) => (
              <div key={r.id} className="rounded-2xl border border-border bg-surface px-5 md:px-7">
                <RecommendationCard rec={r} rank={i + 1} />
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm leading-relaxed text-muted-foreground text-pretty">
            Nenhuma prioridade aberta. O motor só gera prioridades com histórico suficiente e sinal acima dos limites.
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <AttentionBox lines={attention} total={attention.length} />
        <TestsMini experiments={experiments} />
        <OpportunityStrip items={otherOpportunities.slice(0, 3)} total={otherOpportunities.length} />
        <div className="flex flex-col justify-center rounded-2xl border border-border bg-surface p-5 md:p-6">
          <ChannelHealth items={channelHealth} />
        </div>
      </div>
    </>
  )
}

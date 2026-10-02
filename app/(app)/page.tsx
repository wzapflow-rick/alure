import Link from 'next/link'
import { after } from 'next/server'
import { getLatestAnalysis, getRunningAnalysis, isStale, runAnalysis } from '@/lib/analysis'
import { Section } from '@/components/ui/primitives'
import { RecommendationCard } from '@/components/decisions/recommendation-card'
import { RunEngineButton } from '@/components/decisions/run-engine-button'
import { DayReading } from '@/components/command/day-reading'
import { KpiStrip } from '@/components/command/kpi-strip'
import { OpportunityStrip } from '@/components/command/opportunity-strip'
import { AttentionBox } from '@/components/command/attention-box'
import { ChannelHealth, TestsMini, type ChannelHealthItem } from '@/components/command/side-lists'
import { ProductQuickSearch } from '@/components/products/product-search'
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

  return (
    <>
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="eyebrow tabular">{commandDate()} · Visão comercial</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {firstName ? `Bom dia, ${firstName}.` : 'Central de comando.'}
          </h1>
        </div>
        <div className="flex flex-col gap-3 md:w-96 md:items-end">
          <ProductQuickSearch products={productIndex} />
          <RunEngineButton />
        </div>
      </header>

      <KpiStrip kpis={kpis} dailyTarget={settings.dailyTarget} />

      <DayReading brief={brief?.content ?? null} latest={latest} analyzing={analyzing} />

      <div className="grid gap-10 lg:grid-cols-3 lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10 lg:col-span-2">
          <Section
            title="Prioridades"
            action={
              <Link href="/prioridades" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                Ver todas
              </Link>
            }
          >
            {priorities.length ? (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {priorities.map((r, i) => (
                  <RecommendationCard key={r.id} rec={r} rank={i + 1} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Nenhuma prioridade aberta. O motor só gera prioridades quando há histórico suficiente e um sinal acima dos limites configurados.
              </p>
            )}
          </Section>

          <OpportunityStrip items={opportunities.slice(0, 3)} total={opportunities.length} />
        </div>

        <aside className="flex min-w-0 flex-col gap-10">
          <AttentionBox alerts={alerts} />
          <TestsMini experiments={experiments} />
          <ChannelHealth items={channelHealth} />
        </aside>
      </div>
    </>
  )
}

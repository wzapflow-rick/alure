import 'server-only'
import { pool } from '@/lib/db'
import { formatBRL, formatInt, formatPct, todayISO } from '@/lib/format'
import { getEngineSettings } from '@/lib/settings'
import { getTodayKpis, listExperiments, listRecommendations, type BriefItem, type DailyBrief } from '@/lib/queries'
import type { ChannelHealth } from '@/lib/engine/run'
import type { SessionUser } from '@/lib/session'

const STATUS_WORD: Record<ChannelHealth['status'], string> = {
  healthy: 'saudável',
  attention: 'em atenção',
  critical: 'crítico',
  insufficient_data: 'com dados insuficientes',
}

/** Deterministic daily brief built only from stored facts — nothing is invented. */
export async function generateDailyBrief(user: SessionUser | null, analysisRunId: number | null, health: ChannelHealth[]) {
  const [settings, kpis, priorities, opportunities, experiments] = await Promise.all([
    getEngineSettings(),
    getTodayKpis(),
    listRecommendations({ kinds: ['priority', 'test_review'], statuses: ['open'], limit: 20 }),
    listRecommendations({ kinds: ['opportunity'], statuses: ['open'], limit: 20 }),
    listExperiments({ statuses: ['ready_for_review', 'in_progress'] }),
  ])

  const href = (r: { product_id: string | null; experiment_id: string | null }) =>
    r.experiment_id ? `/testes/${r.experiment_id}` : r.product_id ? `/produtos/${r.product_id}` : undefined

  const momentum = opportunities.filter((o) => o.rule_code === 'R5_MOMENTUM')
  const realOpportunities = opportunities.filter((o) => o.rule_code !== 'R5_MOMENTUM')
  const risks = priorities.filter((p) => p.severity === 'critical' || p.severity === 'attention')
  const ready = experiments.filter((e) => e.status === 'ready_for_review')
  const running = experiments.filter((e) => e.status === 'in_progress')
  const connected = health.filter((h) => h.connection === 'connected' || h.channels > 0)
  const targetPct = settings.dailyTarget > 0 ? (kpis.revenue / settings.dailyTarget) * 100 : null

  const positives: BriefItem[] = [
    ...(kpis.hasData && targetPct !== null && targetPct >= 100
      ? [{ text: `Meta diária atingida: ${formatBRL(kpis.revenue)} (${formatPct(targetPct)}).`, tone: 'positive' as const }]
      : []),
    ...momentum.slice(0, 3).map((m) => ({ text: `${m.title}: ${m.issue}`, tone: 'positive' as const, href: href(m) })),
    ...health
      .filter((h) => h.status === 'healthy')
      .map((h) => ({ text: `${h.name} saudável frente à base histórica.`, tone: 'positive' as const })),
  ]

  const riskItems: BriefItem[] = risks.slice(0, 5).map((r) => ({
    text: `${r.title}: ${r.issue}`,
    tone: r.severity === 'critical' ? ('critical' as const) : ('attention' as const),
    href: href(r),
  }))

  const opportunityItems: BriefItem[] = realOpportunities
    .slice(0, 5)
    .map((o) => ({ text: `${o.title}: ${o.issue}`, tone: 'positive' as const, href: href(o) }))

  const actions: BriefItem[] = risks
    .slice(0, 3)
    .map((r) => ({ text: `${r.title} — ${r.recommendation}`, tone: r.severity === 'critical' ? ('critical' as const) : ('attention' as const), href: href(r) }))

  const tests: BriefItem[] = [
    ...ready.map((e) => ({ text: `Teste #${String(e.id).padStart(4, '0')} (${e.product_name}) aguardando decisão.`, tone: 'attention' as const, href: `/testes/${e.id}` })),
    ...running.map((e) => ({
      text: `Teste #${String(e.id).padStart(4, '0')} (${e.product_name}) em andamento até ${e.evaluation_date.split('-').reverse().join('/')} — não interferir.`,
      tone: 'info' as const,
      href: `/testes/${e.id}`,
    })),
  ]

  let summary: string
  if (!kpis.hasData && !connected.length) {
    summary = 'Conecte uma fonte de dados para iniciar a análise.'
  } else if (!kpis.hasData) {
    summary = 'Fonte conectada, aguardando as primeiras vendas sincronizadas.'
  } else {
    const parts: string[] = []
    const critical = risks.filter((r) => r.severity === 'critical').length
    if (risks.length) parts.push(`${risks.length} ponto(s) exigem atenção${critical ? `, ${critical} crítico(s)` : ''}`)
    if (realOpportunities.length) parts.push(`${realOpportunities.length} oportunidade(s)`)
    if (ready.length) parts.push(`${ready.length} teste(s) prontos para decisão`)
    if (running.length) parts.push(`${running.length} teste(s) protegidos`)
    const channelText = health
      .filter((h) => h.channels > 0)
      .map((h) => `${h.name} ${STATUS_WORD[h.status]}`)
      .join(', ')
    summary = parts.length
      ? `${parts.join(', ')}.${channelText ? ` ${channelText}.` : ''}`
      : `Nenhum desvio relevante. Nenhuma ação necessária hoje.${channelText ? ` ${channelText}.` : ''}`
  }

  const lines: DailyBrief['lines'] = [
    kpis.hasData
      ? {
          label: 'Hoje',
          text: `${formatBRL(kpis.revenue)} em ${formatInt(kpis.orders)} pedidos${targetPct !== null ? ` · ${formatPct(targetPct)} da meta` : ''}.`,
          tone: targetPct !== null && targetPct >= 100 ? 'positive' : 'info',
        }
      : { label: 'Dados', text: summary, tone: 'neutral' },
  ]

  const content: DailyBrief = {
    date: todayISO(),
    summary,
    lines,
    positives,
    risks: riskItems,
    opportunities: opportunityItems,
    actions,
    tests,
  }

  await pool.query(
    `INSERT INTO daily_summaries (summary_date, revenue, orders, aov, target, content, generated_by, generated_at, analysis_run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)
     ON CONFLICT (summary_date) DO UPDATE SET
       revenue = EXCLUDED.revenue, orders = EXCLUDED.orders, aov = EXCLUDED.aov, target = EXCLUDED.target,
       content = EXCLUDED.content, generated_by = EXCLUDED.generated_by, generated_at = now(),
       analysis_run_id = EXCLUDED.analysis_run_id`,
    [content.date, kpis.revenue, kpis.orders, kpis.aov, settings.dailyTarget, JSON.stringify(content), user?.id ?? null, analysisRunId],
  )
  return content
}

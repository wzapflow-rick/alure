import 'server-only'
import { pool } from '@/lib/db'
import { formatBRL, formatInt, formatPct, todayISO } from '@/lib/format'
import { getEngineSettings } from '@/lib/settings'
import { getTodayKpis, listExperiments, listRecommendations, type DailyBrief } from '@/lib/queries'
import type { SessionUser } from '@/lib/session'

/** Deterministic morning brief built only from stored facts — no AI involved. */
export async function generateDailyBrief(user: SessionUser | null) {
  const [settings, kpis, priorities, opportunities, experiments] = await Promise.all([
    getEngineSettings(),
    getTodayKpis(),
    listRecommendations({ kinds: ['priority'], statuses: ['open'], limit: 3 }),
    listRecommendations({ kinds: ['opportunity'], statuses: ['open'], limit: 1 }),
    listExperiments({ statuses: ['ready_for_review', 'in_progress'] }),
  ])

  const lines: DailyBrief['lines'] = []
  if (!kpis.hasData) {
    lines.push({ label: 'Dados', text: 'Nenhuma venda sincronizada ainda. Conecte um marketplace ou importe métricas.', tone: 'neutral' })
  } else {
    const pct = settings.dailyTarget > 0 ? (kpis.revenue / settings.dailyTarget) * 100 : null
    lines.push({
      label: 'Hoje',
      text: `${formatBRL(kpis.revenue)} em ${formatInt(kpis.orders)} pedidos${pct !== null ? ` · ${formatPct(pct)} da meta de ${formatBRL(settings.dailyTarget)}` : ''}.`,
      tone: pct !== null && pct >= 100 ? 'positive' : 'info',
    })
  }

  const critical = priorities.filter((p) => p.severity === 'critical')
  if (priorities[0]) {
    lines.push({
      label: 'Foco',
      text: `${priorities[0].title}: ${priorities[0].issue}`,
      tone: critical.length ? 'critical' : 'attention',
    })
  } else {
    lines.push({ label: 'Foco', text: 'Nenhuma prioridade aberta.', tone: 'positive' })
  }

  if (opportunities[0]) {
    lines.push({ label: 'Oportunidade', text: `${opportunities[0].title}: ${opportunities[0].issue}`, tone: 'positive' })
  }

  const ready = experiments.filter((e) => e.status === 'ready_for_review')
  if (ready.length) {
    lines.push({ label: 'Testes', text: `${ready.length} teste(s) aguardando decisão.`, tone: 'attention' })
  } else if (experiments.length) {
    lines.push({ label: 'Testes', text: `${experiments.length} teste(s) em andamento — não alterar esses produtos.`, tone: 'info' })
  }

  const content: DailyBrief = { date: todayISO(), lines }
  await pool.query(
    `INSERT INTO daily_summaries (summary_date, revenue, orders, aov, target, content, generated_by, generated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (summary_date) DO UPDATE SET
       revenue = EXCLUDED.revenue, orders = EXCLUDED.orders, aov = EXCLUDED.aov, target = EXCLUDED.target,
       content = EXCLUDED.content, generated_by = EXCLUDED.generated_by, generated_at = now()`,
    [content.date, kpis.revenue, kpis.orders, kpis.aov, settings.dailyTarget, JSON.stringify(content), user?.id ?? null],
  )
  return content
}

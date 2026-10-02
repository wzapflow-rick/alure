import 'server-only'
import { query, queryOne } from '@/lib/db'
import { generateDailyBrief } from '@/lib/brief'
import { runDailyAIAnalysis } from '@/lib/ai/daily-analysis'
import { runEngine, type ChannelHealth } from '@/lib/engine/run'
import { todayISO } from '@/lib/format'
import type { SessionUser } from '@/lib/session'

export type AnalysisTrigger = 'sync' | 'scheduled' | 'on_open' | 'manual'

export type AnalysisRun = {
  id: string
  analysis_date: string
  trigger: AnalysisTrigger
  status: 'running' | 'success' | 'error'
  started_at: string
  finished_at: string | null
  channels_analyzed: number
  signals: number
  created: number
  resolved: number
  protected_by_tests: number
  health: ChannelHealth[]
  error: string | null
}

const RUN_SELECT = `SELECT id, to_char(analysis_date,'YYYY-MM-DD') AS analysis_date, trigger, status, started_at, finished_at,
       channels_analyzed, signals, created, resolved, protected_by_tests, health, error FROM analysis_runs`

/**
 * Channel status must agree with what the brief shows: it is recounted from the recommendations that are
 * actually open after the run (approved, dismissed or held items no longer make a channel critical).
 * CRÍTICO: ≥1 open critical priority · ATENÇÃO: ≥1 open attention priority, or revenue below the base ·
 * SAUDÁVEL: none of the above · DADOS INSUFICIENTES: no listing with enough history.
 */
async function reconcileHealth(health: ChannelHealth[]): Promise<ChannelHealth[]> {
  const rows = await query<{ marketplace_id: string; critical: string; attention: string }>(
    `SELECT marketplace_id,
            COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
            COUNT(*) FILTER (WHERE severity = 'attention') AS attention
       FROM recommendations
      WHERE status = 'open' AND kind IN ('priority','test_review') AND marketplace_id IS NOT NULL
      GROUP BY marketplace_id`,
  )
  return health.map((h) => {
    if (h.status === 'insufficient_data') return h
    const r = rows.find((x) => Number(x.marketplace_id) === h.marketplaceId)
    const critical = Number(r?.critical ?? 0)
    const attention = Number(r?.attention ?? 0)
    if (critical) return { ...h, status: 'critical', reason: `${critical} prioridade(s) crítica(s) em aberto.` }
    if (attention) return { ...h, status: 'attention', reason: `${attention} ponto(s) de atenção em aberto.` }
    if (h.status === 'attention' && /abaixo da base/.test(h.reason)) return h
    return { ...h, status: 'healthy', reason: 'Sem desvios relevantes frente à base histórica.' }
  })
}

/**
 * SYNC → ANALYZE → DETECT → RECOMMEND → REMEMBER.
 * Stores every run; skips when another run started less than 10 minutes ago.
 */
export async function runAnalysis(trigger: AnalysisTrigger, user: SessionUser | null) {
  const today = todayISO()
  const claimed = await queryOne<{ id: string }>(
    `INSERT INTO analysis_runs (analysis_date, trigger, triggered_by)
     SELECT $1::date, $2, $3
      WHERE NOT EXISTS (SELECT 1 FROM analysis_runs WHERE status = 'running' AND started_at > now() - interval '10 minutes')
     RETURNING id`,
    [today, trigger, user?.id ?? null],
  )
  if (!claimed) return { skipped: true as const }
  const runId = Number(claimed.id)

  try {
    const engine = await runEngine(user, runId)
    const result = { ...engine, health: await reconcileHealth(engine.health) }
    await generateDailyBrief(user, runId, result.health)
    await query(
      `UPDATE analysis_runs SET status = 'success', finished_at = now(), channels_analyzed = $2, signals = $3,
              created = $4, resolved = $5, protected_by_tests = $6, health = $7 WHERE id = $1`,
      [runId, result.channelsAnalyzed, result.signals, result.created, result.resolved, result.protectedByTests, JSON.stringify(result.health)],
    )
    // The deterministic run is already persisted; the AI reading is a layer on top and never fails it.
    const ai = await runDailyAIAnalysis({ analysisRunId: runId, userId: user?.id ?? null, force: trigger === 'manual' })
    return { skipped: false as const, runId, ai: ai.status, ...result }
  } catch (error) {
    await query(`UPDATE analysis_runs SET status = 'error', finished_at = now(), error = $2 WHERE id = $1`, [
      runId,
      (error as Error).message.slice(0, 500),
    ])
    throw error
  }
}

export async function getLatestAnalysis() {
  return queryOne<AnalysisRun>(`${RUN_SELECT} WHERE status = 'success' ORDER BY started_at DESC LIMIT 1`)
}

export async function getRunningAnalysis() {
  return queryOne<AnalysisRun>(
    `${RUN_SELECT} WHERE status = 'running' AND started_at > now() - interval '10 minutes' ORDER BY started_at DESC LIMIT 1`,
  )
}

export async function listAnalysisRuns(limit = 30) {
  return query<AnalysisRun>(`${RUN_SELECT} ORDER BY started_at DESC LIMIT $1`, [limit])
}

/** True when today's data has not been analyzed yet — used to analyze on open. */
export function isStale(latest: AnalysisRun | null) {
  return !latest || latest.analysis_date < todayISO()
}

import 'server-only'
import { queryOne } from '@/lib/db'
import type { AITask, ModelTier } from './model-router'

export type AICallRecord = {
  task: AITask
  tier: ModelTier
  provider: string
  model: string
  status: 'success' | 'error' | 'invalid'
  durationMs: number
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
  analysisRunId?: number | null
  userId?: string | null
  contextSummary?: Record<string, unknown> | null
  validation?: unknown
  error?: string | null
}

let tableReady: boolean | null = null

async function hasTable() {
  if (tableReady) return true
  try {
    const row = await queryOne<{ ok: boolean }>(`SELECT to_regclass('public.ai_calls') IS NOT NULL AS ok`)
    tableReady = Boolean(row?.ok)
  } catch {
    tableReady = false
  }
  return tableReady
}

/** Never throws: observability must not break the feature it observes. Never receives secrets. */
export async function logAICall(rec: AICallRecord) {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[alure:ai]', {
      task: rec.task,
      model: rec.model,
      provider: rec.provider,
      status: rec.status,
      ms: rec.durationMs,
      tokens: { in: rec.inputTokens ?? null, out: rec.outputTokens ?? null },
      context: rec.contextSummary ?? null,
      validation: rec.validation ?? null,
      error: rec.error ?? null,
    })
  }
  try {
    if (!(await hasTable())) return null
    const row = await queryOne<{ id: string }>(
      `INSERT INTO ai_calls (task, tier, provider, model, status, duration_ms, input_tokens, output_tokens, cost_usd,
                             analysis_run_id, user_id, context_summary, validation, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14) RETURNING id`,
      [
        rec.task,
        rec.tier,
        rec.provider,
        rec.model,
        rec.status,
        Math.round(rec.durationMs),
        rec.inputTokens ?? null,
        rec.outputTokens ?? null,
        rec.costUsd ?? null,
        rec.analysisRunId ?? null,
        rec.userId ?? null,
        rec.contextSummary ? JSON.stringify(rec.contextSummary) : null,
        rec.validation ? JSON.stringify(rec.validation) : null,
        rec.error ?? null,
      ],
    )
    return row?.id ?? null
  } catch (err) {
    console.error('[alure] ai_calls insert failed:', (err as Error).message)
    return null
  }
}

export type AIOverview = {
  tableReady: boolean
  lastCall: { created_at: string; task: string; model: string; provider: string; status: string; error: string | null } | null
  lastAnalysis: { created_at: string; model: string; status: string } | null
  last7d: { calls: number; errors: number; input_tokens: number; output_tokens: number; cost_usd: number | null } | null
}

export async function getAIOverview(): Promise<AIOverview> {
  if (!(await hasTable())) return { tableReady: false, lastCall: null, lastAnalysis: null, last7d: null }
  const [lastCall, lastAnalysis, last7d] = await Promise.all([
    queryOne<NonNullable<AIOverview['lastCall']>>(
      `SELECT created_at, task, model, provider, status, error FROM ai_calls ORDER BY created_at DESC LIMIT 1`,
    ),
    queryOne<NonNullable<AIOverview['lastAnalysis']>>(
      `SELECT created_at, model, status FROM ai_calls WHERE task = 'DAILY_ANALYSIS' ORDER BY created_at DESC LIMIT 1`,
    ),
    queryOne<{ calls: string; errors: string; input_tokens: string | null; output_tokens: string | null; cost_usd: string | null }>(
      `SELECT COUNT(*) AS calls, COUNT(*) FILTER (WHERE status <> 'success') AS errors,
              SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd
         FROM ai_calls WHERE created_at > now() - interval '7 days'`,
    ),
  ])
  return {
    tableReady: true,
    lastCall,
    lastAnalysis,
    last7d: last7d
      ? {
          calls: Number(last7d.calls),
          errors: Number(last7d.errors),
          input_tokens: Number(last7d.input_tokens ?? 0),
          output_tokens: Number(last7d.output_tokens ?? 0),
          cost_usd: last7d.cost_usd === null ? null : Number(last7d.cost_usd),
        }
      : null,
  }
}

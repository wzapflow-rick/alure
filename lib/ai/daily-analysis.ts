import 'server-only'
import { createHash } from 'node:crypto'
import { queryOne } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { buildDailyContext } from './context-builder'
import { runStructuredTask } from './orchestrator'
import { dailyAnalysisSchema, type AIBriefBlock, type AIValidation, type DailyAnalysis } from './schemas'

const DAILY_INSTRUCTIONS = `TAREFA: DAILY_ANALYSIS.
Leia o contexto JSON e produza a leitura comercial de hoje.
- O QUE MUDOU deve comparar o período atual com o anterior usando os números do contexto.
- Siga a ordem: tráfego → conversão → ticket → preço. Se visitas caíram junto com pedidos, o gargalo provável é tráfego, não preço.
- No máximo 3 prioridades, ordenadas por impacto em faturamento e pedidos.
- Cada prioridade: fato (com números do contexto), interpretação, hipótese (se houver), ação específica, métrica e data de revisão (YYYY-MM-DD).
- Respeite ACTIVE_TESTS e MEMORY. Liste em "do_not_touch" o que não deve ser alterado e por quê.
- Tudo em UNKNOWN vai para "pending_data". Se os dados não sustentam uma conclusão, marque insufficient_data=true e confidence=LOW.
- Não repita os DETERMINISTIC_FINDINGS palavra por palavra: explique o que eles significam juntos.`

/** Parses numbers written in pt-BR or plain format: "R$ 5.800,50", "12,5%", "1234.5". */
function extractNumbers(text: string): number[] {
  const cleaned = text
    .replace(/\d{4}-\d{2}-\d{2}/g, ' ')
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ')
    .replace(/\b(?:SKU|MLB)[\s:-]*[A-Z0-9-]+/gi, ' ')
  const out: number[] = []
  for (const m of cleaned.matchAll(/-?\d[\d.,]*/g)) {
    let raw = m[0].replace(/[.,]$/, '')
    if (/,\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '')
    else raw = raw.replace(/,/g, '')
    const v = Number(raw)
    if (Number.isFinite(v)) out.push(Math.abs(v))
  }
  return out
}

function collectContextNumbers(value: unknown, acc: number[] = []): number[] {
  if (typeof value === 'number') acc.push(Math.abs(value))
  else if (typeof value === 'string') acc.push(...extractNumbers(value))
  else if (Array.isArray(value)) value.forEach((v) => collectContextNumbers(v, acc))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectContextNumbers(v, acc))
  return acc
}

/** Small integers (counts, priorities, days) are too ambiguous to verify and too low-risk to block. */
function unverified(text: string, known: number[]) {
  return extractNumbers(text).filter((v) => {
    if (v <= 10) return false
    return !known.some((k) => Math.abs(k - v) <= Math.max(0.06, Math.abs(k) * 0.01))
  })
}

/** The model may only cite numbers that exist in the context. Offending factual items are removed. */
function validateNumbers(analysis: DailyAnalysis, context: unknown): { analysis: DailyAnalysis; validation: AIValidation } {
  const known = collectContextNumbers(context)
  const bad = new Set<string>()
  let dropped = 0
  const warnings: string[] = []

  const filterList = (list: string[]) =>
    list.filter((item) => {
      const u = unverified(item, known)
      if (!u.length) return true
      u.forEach((v) => bad.add(String(v)))
      dropped++
      return false
    })

  const clean: DailyAnalysis = {
    ...analysis,
    facts: filterList(analysis.facts),
    what_changed: filterList(analysis.what_changed),
    priorities: analysis.priorities.map((p) => {
      const u = unverified(p.fact, known)
      if (!u.length) return p
      u.forEach((v) => bad.add(String(v)))
      dropped++
      return { ...p, fact: 'Fato removido: citava números que não existem nos dados.' }
    }),
  }
  const summaryBad = unverified(analysis.summary, known)
  if (summaryBad.length) {
    summaryBad.forEach((v) => bad.add(String(v)))
    warnings.push('A leitura de hoje cita números que não foram encontrados no contexto.')
  }

  return { analysis: clean, validation: { schema: 'ok', unverifiedNumbers: [...bad], droppedItems: dropped, warnings } }
}

async function saveBlock(block: AIBriefBlock) {
  await queryOne(
    `UPDATE daily_summaries SET content = jsonb_set(content, '{ai}', $2::jsonb, true) WHERE summary_date = $1::date`,
    [todayISO(), JSON.stringify(block)],
  )
}

/**
 * Runs after the deterministic engine. Failures here never affect the engine's output:
 * the brief simply carries a status explaining why the AI reading is missing.
 */
export async function runDailyAIAnalysis(opts: { analysisRunId: number | null; userId: string | null; force?: boolean }) {
  try {
    const { context, summary } = await buildDailyContext({ analysisRunId: opts.analysisRunId })
    const contextHash = createHash('sha256')
      .update(JSON.stringify({ ...context, engineTrace: null }))
      .digest('hex')
      .slice(0, 16)

    if (!opts.force) {
      const existing = await queryOne<{ ai: AIBriefBlock | null }>(
        `SELECT content->'ai' AS ai FROM daily_summaries WHERE summary_date = $1::date`,
        [todayISO()],
      )
      if (existing?.ai?.status === 'ok' && existing.ai.contextHash === contextHash) return existing.ai
    }

    const result = await runStructuredTask({
      task: 'DAILY_ANALYSIS',
      schema: dailyAnalysisSchema,
      taskInstructions: DAILY_INSTRUCTIONS,
      prompt: `CONTEXTO (JSON):\n${JSON.stringify(context)}`,
      contextSummary: summary,
      analysisRunId: opts.analysisRunId,
      userId: opts.userId,
    })

    const block: AIBriefBlock = result.ok
      ? (() => {
          const { analysis, validation } = validateNumbers(result.data, context)
          return { status: 'ok', generatedAt: new Date().toISOString(), model: result.modelId, provider: result.provider, contextHash, analysis, validation }
        })()
      : { status: result.reason, generatedAt: new Date().toISOString(), message: result.message, model: result.modelId, provider: result.provider }

    await saveBlock(block)
    return block
  } catch (err) {
    console.error('[alure] daily AI analysis failed:', (err as Error).message)
    const block: AIBriefBlock = {
      status: 'unavailable',
      generatedAt: new Date().toISOString(),
      message: 'IA temporariamente indisponível. O motor determinístico continua funcionando.',
    }
    await saveBlock(block).catch(() => undefined)
    return block
  }
}

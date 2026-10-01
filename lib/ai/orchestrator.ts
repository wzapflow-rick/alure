import 'server-only'
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai'
import type { z } from 'zod'
import { selectModel, priceFor, type AITask, type ModelTier } from './model-router'
import { getLanguageModel, safeErrorMessage, type AIProvider } from './openai-client'
import { SYSTEM_PROMPT } from './prompts'
import { logAICall } from './telemetry'

export type PreparedModel = { task: AITask; tier: ModelTier; modelId: string; provider: AIProvider; model: LanguageModel }

/** The backend — never the model — decides which model runs a task. */
export function prepareModel(task: AITask): PreparedModel | null {
  const { tier, modelId } = selectModel(task)
  const resolved = getLanguageModel(modelId)
  return resolved ? { task, tier, modelId, ...resolved } : null
}

type Usage = { inputTokens?: number; outputTokens?: number } | undefined

/**
 * OpenAI direct does not report cost, so it is computed from returned tokens × AI_PRICE_<TIER>.
 * The Gateway's own reported cost is used only when the Gateway was the provider.
 * Returns null ("não calculado") whenever either piece is missing.
 */
export function estimateCost(provider: AIProvider, tier: ModelTier, usage: Usage, providerMetadata?: unknown) {
  if (provider === 'gateway') {
    const reported = (providerMetadata as { gateway?: { cost?: string | number } } | undefined)?.gateway?.cost
    if (reported !== undefined && Number.isFinite(Number(reported))) return Number(reported)
  }
  const price = priceFor(tier)
  if (!price || usage?.inputTokens == null || usage?.outputTokens == null) return null
  return ((usage.inputTokens ?? 0) * price.input + (usage.outputTokens ?? 0) * price.output) / 1_000_000
}

/** Records a call made outside the orchestrator (e.g. the assistant's stream). */
export async function recordUsage(
  prepared: PreparedModel,
  info: { startedAt: number; usage?: Usage; providerMetadata?: unknown; ok: boolean; error?: unknown; userId?: string | null },
) {
  await logAICall({
    task: prepared.task,
    tier: prepared.tier,
    provider: prepared.provider,
    model: prepared.modelId,
    status: info.ok ? 'success' : 'error',
    durationMs: Date.now() - info.startedAt,
    inputTokens: info.usage?.inputTokens ?? null,
    outputTokens: info.usage?.outputTokens ?? null,
    costUsd: estimateCost(prepared.provider, prepared.tier, info.usage, info.providerMetadata),
    userId: info.userId ?? null,
    error: info.error ? safeErrorMessage(info.error) : null,
  })
}

export type TaskResult<T> =
  | { ok: true; data: T; modelId: string; provider: AIProvider; tier: ModelTier }
  | { ok: false; reason: 'not_configured' | 'unavailable' | 'invalid'; message: string; modelId?: string; provider?: AIProvider }

export async function runStructuredTask<S extends z.ZodType>(opts: {
  task: AITask
  schema: S
  prompt: string
  taskInstructions?: string
  contextSummary?: Record<string, unknown>
  analysisRunId?: number | null
  userId?: string | null
  timeoutMs?: number
}): Promise<TaskResult<z.infer<S>>> {
  const prepared = prepareModel(opts.task)
  if (!prepared) {
    return { ok: false, reason: 'not_configured', message: 'IA não configurada. Configure OPENAI_API_KEY nas variáveis de ambiente da Vercel.' }
  }

  const base = {
    task: opts.task,
    tier: prepared.tier,
    provider: prepared.provider,
    model: prepared.modelId,
    analysisRunId: opts.analysisRunId ?? null,
    userId: opts.userId ?? null,
    contextSummary: opts.contextSummary ?? null,
  }

  // One retry only when the model returned something that does not match the contract.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now()
    try {
      const result = await generateText({
        model: prepared.model,
        instructions: opts.taskInstructions ? `${SYSTEM_PROMPT}\n\n${opts.taskInstructions}` : SYSTEM_PROMPT,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      })
      const parsed = opts.schema.safeParse(result.output)
      if (!parsed.success) throw new Error(`Resposta fora do schema: ${parsed.error.message.slice(0, 300)}`)
      await logAICall({
        ...base,
        status: 'success',
        durationMs: Date.now() - startedAt,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        costUsd: estimateCost(prepared.provider, prepared.tier, result.usage, result.providerMetadata),
        validation: { schema: 'ok', attempt },
      })
      return { ok: true, data: parsed.data, modelId: prepared.modelId, provider: prepared.provider, tier: prepared.tier }
    } catch (error) {
      const invalid = NoObjectGeneratedError.isInstance(error) || (error as Error).message?.startsWith('Resposta fora do schema')
      await logAICall({
        ...base,
        status: invalid ? 'invalid' : 'error',
        durationMs: Date.now() - startedAt,
        validation: { schema: invalid ? 'failed' : 'not_reached', attempt },
        error: safeErrorMessage(error),
      })
      if (invalid && attempt === 1) continue
      return invalid
        ? { ok: false, reason: 'invalid', message: 'Não foi possível concluir a análise: a resposta da IA não passou na validação.', modelId: prepared.modelId, provider: prepared.provider }
        : { ok: false, reason: 'unavailable', message: 'IA temporariamente indisponível. O motor determinístico continua funcionando.', modelId: prepared.modelId, provider: prepared.provider }
    }
  }
  return { ok: false, reason: 'invalid', message: 'Não foi possível concluir a análise.' }
}

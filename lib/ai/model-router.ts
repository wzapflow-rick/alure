import 'server-only'

export type AITask = 'DAILY_ANALYSIS' | 'ASSISTANT_QUERY' | 'CONNECTION_TEST' | 'DOCUMENT_EXTRACTION'

export type ModelTier = 'fast' | 'default' | 'deep'

/** The only place in the codebase that knows model names. Env vars override these fallbacks. */
const FALLBACK_MODELS: Record<ModelTier, string> = {
  fast: 'gpt-5.6-luna',
  default: 'gpt-5.6-terra',
  deep: 'gpt-5.6-sol',
}

const ENV_KEYS: Record<ModelTier, string> = {
  fast: 'AI_MODEL_FAST',
  default: 'AI_MODEL_DEFAULT',
  deep: 'AI_MODEL_DEEP',
}

/**
 * Only the assistant runs on the default tier: it compensates for a smaller model with a rich
 * database context and tools. Everything else is structured or validated output and runs on fast.
 * No task uses deep.
 */
const TASK_TIER: Record<AITask, ModelTier> = {
  DAILY_ANALYSIS: 'fast',
  ASSISTANT_QUERY: 'default',
  CONNECTION_TEST: 'fast',
  DOCUMENT_EXTRACTION: 'fast',
}

function modelFor(tier: ModelTier) {
  return process.env[ENV_KEYS[tier]]?.trim() || FALLBACK_MODELS[tier]
}

export const getDefaultModel = () => modelFor('default')
export const getFastModel = () => modelFor('fast')
export const getDeepModel = () => modelFor('deep')

export function selectModel(task: AITask): { tier: ModelTier; modelId: string } {
  const tier = TASK_TIER[task]
  return { tier, modelId: modelFor(tier) }
}

export function listConfiguredModels() {
  return (['default', 'fast', 'deep'] as const).map((tier) => ({
    tier,
    modelId: modelFor(tier),
    fromEnv: Boolean(process.env[ENV_KEYS[tier]]?.trim()),
    envKey: ENV_KEYS[tier],
  }))
}

/**
 * Optional pricing (USD per 1M tokens) as "input,output" in AI_PRICE_FAST / AI_PRICE_DEFAULT / AI_PRICE_DEEP.
 * Without it, cost is only recorded when the provider reports it.
 */
export function priceFor(tier: ModelTier): { input: number; output: number } | null {
  const raw = process.env[`AI_PRICE_${tier.toUpperCase()}`]
  if (!raw) return null
  const [input, output] = raw.split(',').map((v) => Number(v.trim()))
  return Number.isFinite(input) && Number.isFinite(output) ? { input, output } : null
}

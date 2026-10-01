import 'server-only'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

export type AIProvider = 'openai' | 'gateway'

let openai: OpenAIProvider | null = null

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export function isProductionDeployment() {
  return process.env.VERCEL_ENV === 'production'
}

/**
 * OPENAI_API_KEY present → OpenAI API directly, always.
 * No key → Vercel AI Gateway only as a development fallback; production stays unconfigured
 * instead of silently switching providers.
 */
export function getProvider(): AIProvider | null {
  if (hasOpenAIKey()) return 'openai'
  if (isProductionDeployment()) return null
  return 'gateway'
}

export const PROVIDER_LABEL: Record<AIProvider, string> = {
  openai: 'OpenAI',
  gateway: 'Vercel AI Gateway (fallback de desenvolvimento)',
}

export function getLanguageModel(modelId: string): { model: LanguageModel; provider: AIProvider } | null {
  const provider = getProvider()
  if (provider === 'openai') {
    openai ??= createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return { model: openai(modelId), provider }
  }
  if (provider === 'gateway') return { model: `openai/${modelId}`, provider }
  return null
}

/** Strips anything that looks like a credential before an error message is stored or logged. */
export function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 500)
}

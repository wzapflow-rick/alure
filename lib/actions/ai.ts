'use server'

import { generateText } from 'ai'
import { revalidatePath } from 'next/cache'
import { prepareModel, recordUsage } from '@/lib/ai/orchestrator'
import { safeErrorMessage } from '@/lib/ai/openai-client'
import { authed, failure, type ActionState } from '@/lib/actions/shared'

export async function testAIConnection(_: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const prepared = prepareModel('CONNECTION_TEST')
    if (!prepared) return { ok: false, message: 'IA não configurada. Configure OPENAI_API_KEY nas variáveis de ambiente da Vercel.' }

    const startedAt = Date.now()
    try {
      const result = await generateText({ model: prepared.model, prompt: 'Responda apenas com a palavra: ok' })
      await recordUsage(prepared, { startedAt, usage: result.totalUsage, providerMetadata: result.providerMetadata, ok: true, userId: user.id })
      revalidatePath('/configuracoes')
      return { ok: true, message: `Conexão ok · ${prepared.modelId} · ${Date.now() - startedAt} ms` }
    } catch (error) {
      await recordUsage(prepared, { startedAt, ok: false, error, userId: user.id })
      revalidatePath('/configuracoes')
      return { ok: false, message: `Falha: ${safeErrorMessage(error)}` }
    }
  } catch (error) {
    return failure(error)
  }
}

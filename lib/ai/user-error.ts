import { safeErrorMessage } from '@/lib/ai/openai-client'

/** Translates provider/database failures into a message the operator can act on. */
export function describeAIError(error: unknown): string {
  const raw = safeErrorMessage(error)
  const status = (error as { statusCode?: number })?.statusCode

  if (/timeout exceeded when trying to connect|Connection terminated|ECONNRESET|ECONNREFUSED/i.test(raw)) {
    return 'O banco de dados não respondeu a tempo. Tente de novo em alguns segundos.'
  }
  if (status === 401 || /invalid api key|incorrect api key/i.test(raw)) {
    return 'A chave da OpenAI foi recusada. Confira o OPENAI_API_KEY nas variáveis da Vercel e publique de novo.'
  }
  if (status === 429 || /quota|rate limit/i.test(raw)) {
    return 'A OpenAI recusou por limite de uso ou saldo. Confira o faturamento da conta OpenAI.'
  }
  if (status === 404 || /model .* does not exist|model_not_found/i.test(raw)) {
    return 'O modelo configurado não existe nesta conta OpenAI. Confira AI_MODEL_DEFAULT nas variáveis.'
  }
  return `Não foi possível responder agora (${raw.slice(0, 160)}).`
}

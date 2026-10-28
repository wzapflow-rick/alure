import 'server-only'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { prepareModel, recordUsage } from '@/lib/ai/orchestrator'
import { CATEGORY_VALUES } from '@/lib/bills/constants'

export const extractedBillSchema = z.object({
  beneficiary: z.string().nullable().describe('Quem recebe o pagamento (beneficiário / cedente / credor)'),
  description: z.string().nullable().describe('Resumo curto do que está sendo cobrado'),
  category: z.enum(CATEGORY_VALUES).nullable(),
  amount: z.number().nullable().describe('Valor do documento em reais, sem descontos'),
  due_date: z.string().nullable().describe('Vencimento no formato AAAA-MM-DD'),
  digitable_line: z.string().nullable().describe('Linha digitável completa, apenas números'),
  document_number: z.string().nullable().describe('Número do documento / nosso número / nota'),
  installment_number: z.number().int().nullable().describe('Número da parcela, se houver'),
  installment_total: z.number().int().nullable().describe('Total de parcelas, se houver'),
})

export type ExtractedBill = z.infer<typeof extractedBillSchema>

const INSTRUCTIONS = `Você lê boletos e contas brasileiras para o financeiro de uma pequena empresa.
Extraia apenas o que está escrito no documento. Nunca invente: use null quando a informação não aparecer.
- beneficiary: nome do beneficiário/cedente (quem vai receber), não o pagador.
- amount: "Valor do documento" (ou "Total a pagar" em contas de consumo), em número com ponto decimal.
- due_date: data de vencimento em AAAA-MM-DD.
- digitable_line: a linha digitável (47 ou 48 dígitos), somente números.
- category: escolha a mais provável entre as opções; use "outros" se não souber.
- installment_number / installment_total: só se o documento disser algo como "parcela 3/10".`

export type ExtractOutcome = { ok: true; data: ExtractedBill } | { ok: false; message: string }

export async function extractBillFromFile(file: File, userId: string): Promise<ExtractOutcome> {
  const prepared = prepareModel('DOCUMENT_EXTRACTION')
  if (!prepared) return { ok: false, message: 'Leitura automática indisponível: IA não configurada. Preencha os campos à mão.' }

  const startedAt = Date.now()
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await generateText({
      model: prepared.model,
      instructions: INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados deste boleto.' },
            { type: 'file', data: bytes, mediaType: file.type, filename: file.name },
          ],
        },
      ],
      output: Output.object({ schema: extractedBillSchema }),
      maxOutputTokens: 2000,
      providerOptions: { openai: { reasoningEffort: 'low', promptCacheKey: 'alure-DOCUMENT_EXTRACTION' } },
      abortSignal: AbortSignal.timeout(60_000),
    })
    const parsed = extractedBillSchema.safeParse(result.output)
    await recordUsage(prepared, { startedAt, usage: result.usage, providerMetadata: result.providerMetadata, ok: parsed.success, userId })
    if (!parsed.success) return { ok: false, message: 'Não consegui ler o boleto com segurança. Confira e preencha os campos.' }
    return { ok: true, data: parsed.data }
  } catch (error) {
    await recordUsage(prepared, { startedAt, ok: false, error, userId })
    return { ok: false, message: 'Não consegui ler o arquivo agora. O arquivo foi anexado; preencha os campos à mão.' }
  }
}

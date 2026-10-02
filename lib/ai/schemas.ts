import { z } from 'zod'

export const confidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])

const prioritySchema = z.object({
  source_event_id: z
    .string()
    .describe('OBRIGATÓRIO: "id" exato de um item de DETERMINISTIC_FINDINGS ou ALERTS que origina esta prioridade'),
  title: z.string().describe('Título curto da prioridade'),
  sku: z.string().nullable().describe('SKU quando a prioridade é de um produto; null se for do canal'),
  fact: z.string().describe('FATO: números exatamente como estão no contexto'),
  interpretation: z.string().describe('INTERPRETAÇÃO: por que isso importa'),
  hypothesis: z.string().nullable().describe('HIPÓTESE marcada como tal, ou null'),
  action: z.string().describe('AÇÃO prática e específica'),
  metric: z.string().describe('Métrica que mede o resultado da ação'),
  review_date: z.string().describe('Data de reavaliação YYYY-MM-DD'),
  respects_tests_and_memory: z.boolean().describe('true se a ação não contamina testes ativos nem contradiz a memória'),
})

/** Contract for DAILY_ANALYSIS. Anything that fails this schema is never shown as a recommendation. */
export const dailyAnalysisSchema = z.object({
  summary: z.string().describe('LEITURA DE HOJE em 2 a 4 frases'),
  what_changed: z.array(z.string()).describe('O QUE MUDOU: comparações do período atual vs. anterior'),
  what_matters: z.array(z.string()).describe('O QUE IMPORTA'),
  main_bottleneck: z.string().nullable().describe('MAIOR GARGALO ou null se não houver evidência'),
  priorities: z.array(prioritySchema).max(3).describe('PRIORIDADE 1, 2 e 3 em ordem'),
  signals_to_investigate: z
    .array(z.string())
    .describe('Possíveis sinais vistos nos FACTS que NÃO estão em DETERMINISTIC_FINDINGS nem ALERTS. Nunca viram prioridade.'),
  opportunities: z.array(z.string()),
  tests: z.array(z.string()).describe('Estado dos testes ativos e o que proteger'),
  do_not_touch: z.array(z.string()).describe('O QUE NÃO MEXER e por quê'),
  pending_data: z.array(z.string()).describe('DADOS PENDENTES que limitam a análise'),
  facts: z.array(z.string()),
  interpretation: z.array(z.string()),
  hypotheses: z.array(z.string()),
  actions: z.array(z.string()),
  metrics: z.array(z.string()),
  review_period: z.string(),
  confidence: confidenceSchema,
  insufficient_data: z.boolean(),
})

export type DailyAnalysis = z.infer<typeof dailyAnalysisSchema>

export type AIValidation = {
  schema: 'ok' | 'failed'
  unverifiedNumbers: string[]
  droppedItems: number
  warnings: string[]
  droppedPriorities?: number
  unknownSkus?: string[]
}

export type AIBriefBlock = {
  status: 'ok' | 'not_configured' | 'unavailable' | 'invalid'
  generatedAt: string
  message?: string
  model?: string
  provider?: string
  contextHash?: string
  analysis?: DailyAnalysis
  validation?: AIValidation
}

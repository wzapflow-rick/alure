import { z } from 'zod'

export const confidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH'])

const metricKeySchema = z.enum(['revenue', 'orders', 'units', 'visits', 'conversion', 'average_ticket'])

const prioritySchema = z.object({
  source_event_id: z
    .string()
    .describe('OBRIGATÓRIO: "id" exato de um item de DETERMINISTIC_FINDINGS ou ALERTS que origina esta prioridade'),
  title: z.string().describe('Título curto da prioridade, sem números'),
  sku: z.string().nullable().describe('SKU quando a prioridade é de um produto; null se for do canal'),
  fact: z.string().describe('FATO: copie o "display" das métricas citadas ou o "problema" do evento'),
  interpretation: z.string().describe('INTERPRETAÇÃO: por que isso importa, citando métricas pelo nome'),
  hypothesis: z.string().nullable().describe('HIPÓTESE marcada como tal, ou null'),
  action: z.string().describe('AÇÃO prática e específica'),
  metric: z.string().describe('Nome da métrica que mede o resultado da ação'),
  review_date: z.string().describe('Data de reavaliação YYYY-MM-DD'),
  respects_tests_and_memory: z.boolean().describe('true se a ação não contamina testes ativos nem contradiz a memória'),
})

/** What the model is allowed to write. Numeric sections are rendered by the backend, never by the model. */
export const dailyAnalysisSchema = z.object({
  summary: z.string().describe('LEITURA DE HOJE em 2 a 4 frases, citando métricas pelo nome'),
  what_matters: z
    .array(z.string())
    .describe('O QUE IMPORTA: relações entre métricas nomeadas e comparáveis. Prefira não repetir números.'),
  main_bottleneck: z.string().nullable().describe('MAIOR GARGALO ou null se não houver evidência'),
  priorities: z.array(prioritySchema).max(3).describe('PRIORIDADE 1, 2 e 3 em ordem'),
  signals_to_investigate: z
    .array(
      z.object({
        sku: z.string().describe('SKU exato de FACTS.products'),
        canal: z.string().describe('Canal exato do produto em FACTS.products'),
        observacao: z.string().describe('O que chamou atenção, citando métricas pelo nome, sem números'),
      }),
    )
    .max(5)
    .describe('Produtos de FACTS com comportamento que NÃO está em DETERMINISTIC_FINDINGS nem ALERTS. Nunca viram prioridade.'),
  opportunities: z
    .array(
      z.object({
        sku: z.string().nullable().describe('SKU exato, ou null quando a oportunidade é do canal'),
        canal: z.string().describe('Canal exato'),
        metric: metricKeySchema.describe('Métrica que sustenta a oportunidade'),
        interpretacao: z.string().describe('Leitura da métrica, sem números'),
        motivo: z.string().describe('Por que é uma oportunidade (ou só monitoramento), sem números'),
      }),
    )
    .max(4),
  hypotheses: z.array(z.string()).describe('Hipóteses, sempre identificadas como hipótese'),
  confidence: confidenceSchema,
  insufficient_data: z.boolean(),
})

export type DailyAnalysisAI = z.infer<typeof dailyAnalysisSchema>

export type ChangeRow = { name: string; from: string | null; to: string | null; delta: string | null; note: string | null }
export type ChangeGroup = { source: string; period_current: string; period_previous: string; rows: ChangeRow[] }
export type MetricLine = { name: string; current: string; previous: string; delta: string | null }
export type SignalCard = { sku: string; produto: string; canal: string; lines: MetricLine[]; observacao: string | null; motivo: string }
export type OpportunityCard = {
  sku: string | null
  produto: string | null
  canal: string
  line: MetricLine
  period: string
  interpretacao: string
  motivo: string
}
export type PendingCard = { dado: string; impacto: string }

/** Saved reading: model text that passed validation plus backend-rendered numeric sections. */
export type DailyAnalysis = {
  summary: string
  main_bottleneck: string | null
  priorities: DailyAnalysisAI['priorities']
  what_matters: string[]
  hypotheses: string[]
  tests: string[]
  do_not_touch: string[]
  review_period: string
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  insufficient_data: boolean
  changes?: ChangeGroup[]
  signal_cards?: SignalCard[]
  opportunity_cards?: OpportunityCard[]
  pending_cards?: PendingCard[]
  /** Legacy readings saved before the structured context. */
  what_changed?: string[]
  opportunities?: string[]
  pending_data?: string[]
}

export type ValidationDiagnostic = {
  section: string
  text: string
  number: string | null
  reason: string
  origin: string
}

export type AIValidation = {
  schema: 'ok' | 'failed'
  unverifiedNumbers: string[]
  droppedItems: number
  warnings: string[]
  droppedPriorities?: number
  unknownSkus?: string[]
  removedNumbers?: number
  diagnostics?: ValidationDiagnostic[]
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

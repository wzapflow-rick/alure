import 'server-only'
import { createHash } from 'node:crypto'
import { queryOne } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { buildDailyContext } from './context-builder'
import { runStructuredTask } from './orchestrator'
import { dailyAnalysisSchema, type AIBriefBlock, type AIValidation, type DailyAnalysis } from './schemas'

const VALIDATOR_VERSION = 2

const DAILY_INSTRUCTIONS = `TAREFA: DAILY_ANALYSIS.
O motor determinístico decide O QUE está acontecendo. Você só explica POR QUE isso pode importar. O usuário decide o que fazer.

REGRAS ABSOLUTAS
- Prioridades só podem nascer de um item de DETERMINISTIC_FINDINGS ou ALERTS. Cada prioridade DEVE trazer em "source_event_id" o "id" exato desse item. Sem item correspondente, não existe prioridade.
- Se DETERMINISTIC_FINDINGS e ALERTS estiverem vazios: priorities=[], main_bottleneck=null e o resumo deve dizer "Nenhum evento determinístico relevante foi identificado."
- Qualquer sinal que você perceber nos FACTS e que o motor NÃO classificou vai para "signals_to_investigate", nunca para prioridades, gargalo ou resumo.
- Use somente números que aparecem literalmente no contexto. NÃO calcule percentuais, diferenças, médias ou projeções. Se uma variação não estiver em "variacao_pct", não cite a variação.
- Use o SKU exatamente como aparece no contexto (KNOWN_SKUS). Nunca adicione prefixos nem altere o identificador.
- FATO = apenas dado do contexto. INTERPRETAÇÃO = leitura desses fatos. HIPÓTESE = explicação possível, marcada como hipótese. AÇÃO = próximo passo. Nunca escreva hipótese como fato (ex.: "o problema é o preço" sem evidência).
- O período analisado é "period" (start → end). Datas de revisão são instruções futuras e nunca fazem parte do período analisado.
- Estoque: o ALURE não gerencia compras. Nunca recomende comprar, repor ou programar compra. Use: "Verificar disponibilidade com o responsável pelo estoque para evitar interrupção comercial."
- Respeite ACTIVE_TESTS e MEMORY. Liste em "do_not_touch" o que não deve ser alterado e por quê.
- Tudo em UNKNOWN vai para "pending_data".

CONFIANÇA
- HIGH: dados completos e evento determinístico claro.
- MEDIUM: evento válido com alguma incerteza interpretativa.
- LOW: dados incompletos ou pouca evidência (marque insufficient_data=true).
Uma explicação convincente não é motivo para HIGH.

FORMATO
- No máximo 3 prioridades, na ordem de impacto comercial dos eventos.
- O QUE MUDOU: compare atual vs. anterior apenas com números já presentes no contexto.
- Ordem de leitura: tráfego → conversão → ticket → preço.
- Não repita os DETERMINISTIC_FINDINGS palavra por palavra: explique o que eles significam juntos.
- Prefira "Dados insuficientes" a uma conclusão bonita e não comprovada.`

const NO_EVENTS = 'Nenhum evento determinístico relevante foi identificado.'
const STOCK_SAFE = 'Verificar disponibilidade com o responsável pelo estoque para evitar interrupção comercial.'
const STOCK_FORBIDDEN =
  /\b(programar|fazer|realizar|planejar|agendar)\s+(a\s+|uma\s+|nova\s+)?compra|\brepor\b|\breponha\b|reposi[çc][ãa]o|\bcomprar\s+(\d|mais)|compra\s+de\s+\d/i
const HEDGING = /\b(pode|poderia|podem|provavelmente|possivelmente|talvez|sugere|parece|indica que|deve ser|causad[oa] por|por causa d|o problema é)\b/i
const PRIORITY_WORDS = /\b(prioridade|priorit|risco|gargalo|urgente|recuperar|perda|perdeu|caiu|queda)\b/i
const DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g

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

type ValidationContext = {
  today: string
  period: { start: string; end: string }
  DETERMINISTIC_FINDINGS: { id: string; sku: string | null; problema: string; recomendacao: string }[]
  ALERTS: { id: string; mensagem: string }[]
  ACTIVE_TESTS: { sku: string | null }[]
  KNOWN_SKUS: string[]
  UNKNOWN: string[]
}

type SourceEvent = { id: string; sku: string | null; fact: string; action: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const splitSentences = (text: string) => text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? []

function shiftDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function datesIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(DATE_RE)) {
    if (m[1]) out.push(`${m[1]}-${m[2]}-${m[3]}`)
    else out.push(`${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`)
  }
  return out
}

/**
 * Final gate before a reading is saved. The engine is the source of truth: every number must exist in
 * the context, every priority must point to a deterministic event, and anything that fails is removed
 * from the whole reading — never rewritten with invented content.
 */
function validateAnalysis(analysis: DailyAnalysis, rawContext: unknown): { analysis: DailyAnalysis; validation: AIValidation } {
  const ctx = rawContext as ValidationContext
  const known = collectContextNumbers(rawContext)
  const knownSkus = [...ctx.KNOWN_SKUS].sort((a, b) => b.length - a.length)
  const bad = new Set<string>()
  const unknownSkus = new Set<string>()
  const warnings: string[] = []
  let dropped = 0
  let droppedPriorities = 0

  const events = new Map<string, SourceEvent>()
  for (const f of ctx.DETERMINISTIC_FINDINGS) events.set(f.id, { id: f.id, sku: f.sku, fact: f.problema, action: f.recomendacao })
  for (const a of ctx.ALERTS) events.set(a.id, { id: a.id, sku: null, fact: a.mensagem, action: STOCK_FORBIDDEN.test(a.mensagem) ? STOCK_SAFE : '' })
  const eventSkus = new Set([...events.values()].map((e) => e.sku).filter(Boolean) as string[])
  const testedSkus = new Set(ctx.ACTIVE_TESTS.map((t) => t.sku).filter(Boolean) as string[])
  const hasEvents = events.size > 0

  /** Canonical SKU: strips invented prefixes like "KLS-2580.E.BR" → "2580.E.BR". */
  const canonicalSkus = (text: string) =>
    knownSkus.reduce((t, sku) => t.replace(new RegExp(`\\b[A-Z]{2,6}-(${escapeRe(sku)})(?![\\w.])`, 'g'), '$1'), text)

  const withoutSkus = (text: string) => knownSkus.reduce((t, sku) => t.split(sku).join(' '), text)

  const sentenceOk = (s: string, opts: { allowFutureDates?: boolean; requireEventSku?: boolean }) => {
    const nums = unverified(withoutSkus(s), known)
    if (nums.length) {
      nums.forEach((v) => bad.add(String(v)))
      return false
    }
    if (!opts.allowFutureDates && !/revis|reavali/i.test(s) && datesIn(s).some((d) => d > ctx.today)) return false
    if (opts.requireEventSku && PRIORITY_WORDS.test(s)) {
      const cited = knownSkus.filter((sku) => s.includes(sku))
      if (cited.some((sku) => !eventSkus.has(sku))) return false
    }
    return true
  }

  /** Removes only the offending sentences; returns null when nothing valid is left. */
  const clean = (text: string | null | undefined, opts: { allowFutureDates?: boolean; requireEventSku?: boolean } = {}) => {
    if (!text) return null
    let t = canonicalSkus(text.trim())
    if (STOCK_FORBIDDEN.test(t)) t = STOCK_SAFE
    const sentences = splitSentences(t)
    const kept = sentences.filter((s) => sentenceOk(s, opts))
    if (kept.length < sentences.length) dropped++
    return kept.length ? kept.join(' ') : null
  }

  const cleanList = (list: string[], opts: { noHedging?: boolean; requireEventSku?: boolean; prefix?: string } = {}) => {
    const out: string[] = []
    for (const item of list) {
      const c = clean(item, { requireEventSku: opts.requireEventSku })
      if (!c) continue
      if (opts.noHedging && HEDGING.test(c)) {
        dropped++
        continue
      }
      const text = opts.prefix ? `${opts.prefix} ${c}` : c
      if (!out.includes(text)) out.push(text)
    }
    return out
  }

  const usedSources = new Set<string>()
  const priorities: DailyAnalysis['priorities'] = []
  for (const p of analysis.priorities) {
    const source = events.get(p.source_event_id)
    if (!source || usedSources.has(source.id)) {
      droppedPriorities++
      continue
    }
    if (!p.respects_tests_and_memory) {
      droppedPriorities++
      continue
    }
    const sku = source.sku ?? (p.sku && ctx.KNOWN_SKUS.includes(canonicalSkus(p.sku)) ? canonicalSkus(p.sku) : null)
    if (p.sku && !source.sku && !sku) unknownSkus.add(p.sku)

    let fact = clean(p.fact)
    if (!fact || HEDGING.test(fact)) fact = source.fact
    const action = clean(p.action) ?? (source.action || null)
    if (!action) {
      droppedPriorities++
      continue
    }
    if (sku && testedSkus.has(sku) && /pre[çc]o|t[íi]tulo|foto|frete|ads|an[úu]ncio/i.test(action) && !/n[ãa]o (alterar|mexer)|investigar|verificar|aguardar/i.test(action)) {
      droppedPriorities++
      warnings.push(`Prioridade de ${sku} removida: alteraria um teste ativo.`)
      continue
    }
    const review = /^\d{4}-\d{2}-\d{2}$/.test(p.review_date) && p.review_date > ctx.today ? p.review_date : shiftDays(ctx.today, 7)
    usedSources.add(source.id)
    priorities.push({
      ...p,
      source_event_id: source.id,
      sku,
      title: clean(p.title) ?? source.fact.slice(0, 80),
      fact,
      interpretation: clean(p.interpretation) ?? 'Dados insuficientes para interpretar este evento.',
      hypothesis: clean(p.hypothesis),
      action,
      metric: clean(p.metric) ?? 'Dados insuficientes.',
      review_date: review,
    })
  }
  if (droppedPriorities) warnings.push(`${droppedPriorities} prioridade(s) da IA removida(s): sem evento determinístico de origem ou com evidência inválida.`)

  let summary = clean(analysis.summary, { requireEventSku: true })
  let mainBottleneck = hasEvents ? clean(analysis.main_bottleneck, { requireEventSku: true }) : null
  if (!hasEvents) summary = NO_EVENTS
  else if (!summary) summary = 'Dados insuficientes para um resumo confiável. Veja os eventos do motor acima.'
  if (mainBottleneck && HEDGING.test(mainBottleneck) && !/hip[óo]tese/i.test(mainBottleneck)) mainBottleneck = null

  const signals = cleanList(analysis.signals_to_investigate ?? [], {
    prefix: 'Possível sinal a investigar, ainda não classificado pelo motor:',
  })

  let confidence = analysis.confidence
  const cap = (level: 'MEDIUM' | 'LOW') => {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const
    if (order[confidence] > order[level]) confidence = level
  }
  const incompleteData = ctx.UNKNOWN.some((u) => /incomplet|desconhecid|não calcul|nenhum canal/i.test(u))
  if (analysis.insufficient_data) cap('LOW')
  if (!hasEvents || incompleteData || dropped > 0 || droppedPriorities > 0) cap('MEDIUM')

  if (bad.size) warnings.push('Números não encontrados no contexto foram removidos de toda a leitura.')

  const result: DailyAnalysis = {
    ...analysis,
    summary,
    main_bottleneck: mainBottleneck,
    priorities,
    what_changed: cleanList(analysis.what_changed),
    what_matters: [...cleanList(analysis.what_matters, { requireEventSku: true }), ...signals],
    signals_to_investigate: signals,
    opportunities: cleanList(analysis.opportunities, { requireEventSku: true }),
    tests: cleanList(analysis.tests),
    do_not_touch: cleanList(analysis.do_not_touch),
    pending_data: cleanList(analysis.pending_data),
    facts: cleanList(analysis.facts, { noHedging: true }),
    interpretation: cleanList(analysis.interpretation),
    hypotheses: cleanList(analysis.hypotheses),
    actions: cleanList(analysis.actions, { requireEventSku: true }),
    metrics: cleanList(analysis.metrics),
    review_period: `Período analisado: ${brDate(ctx.period.start)} → ${brDate(ctx.period.end)}`,
    confidence,
    insufficient_data: analysis.insufficient_data || confidence === 'LOW',
  }

  return {
    analysis: result,
    validation: {
      schema: 'ok',
      unverifiedNumbers: [...bad],
      droppedItems: dropped,
      droppedPriorities,
      unknownSkus: [...unknownSkus],
      warnings,
    },
  }
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
      .update(JSON.stringify({ ...context, engineTrace: null, validator: VALIDATOR_VERSION }))
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
          const { analysis, validation } = validateAnalysis(result.data, context)
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

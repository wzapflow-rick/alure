import 'server-only'
import { createHash } from 'node:crypto'
import { queryOne } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { brDate, buildDailyContext, metricLine, METRIC_KEYS, METRIC_NAME, type DailyContext, type MetricKey, type MetricSet } from './context-builder'
import { runStructuredTask } from './orchestrator'
import {
  dailyAnalysisSchema,
  type AIBriefBlock,
  type AIValidation,
  type ChangeGroup,
  type DailyAnalysis,
  type DailyAnalysisAI,
  type OpportunityCard,
  type SignalCard,
  type ValidationDiagnostic,
} from './schemas'

const VALIDATOR_VERSION = 3

const DAILY_INSTRUCTIONS = `TAREFA: DAILY_ANALYSIS.
O motor determinístico decide O QUE está acontecendo. Você só explica POR QUE isso pode importar. O usuário decide o que fazer.

COMO LER O CONTEXTO
- Cada métrica chega como objeto nomeado: name, current, previous, change_percent (ou change_points para Conversão), period_current, period_previous, source, comparable e "display".
- "display" já é a frase pronta e correta da métrica. Quando precisar citar um número, copie o "display" inteiro. Nunca escreva um número solto sem o nome da métrica.
- Se "comparable" for false, a métrica NÃO pode ser comparada: diga "Não há dados suficientes para avaliar <métrica>".
- Conversão varia em pontos percentuais (p.p.), nunca em %.
- MEMORY é memória histórica: nunca misture números dela com métricas do período atual.
- CHANNEL_STATUS é o status oficial de cada canal, calculado pelo motor. Você não decide nem altera o status de canal.

REGRAS ABSOLUTAS
- Prioridades só nascem de um item de DETERMINISTIC_FINDINGS ou ALERTS, com o "id" exato em "source_event_id".
- Sem itens em DETERMINISTIC_FINDINGS e ALERTS: priorities=[], main_bottleneck=null e o resumo diz "Nenhum evento determinístico relevante foi identificado."
- Sinais que você perceber em FACTS.products e que o motor NÃO classificou vão para "signals_to_investigate" (só sku, canal e observação sem números). O sistema preenche os números.
- Oportunidades: informe sku, canal e a métrica; o sistema preenche os valores. Interpretação e motivo sem números.
- NÃO calcule percentuais, diferenças, médias, somas ou projeções.
- Use o SKU exatamente como em KNOWN_SKUS.
- FATO = dado do contexto. INTERPRETAÇÃO = leitura dos fatos. HIPÓTESE = explicação possível, sempre escrita como hipótese.
- Estoque: o ALURE não gerencia compras. Nunca recomende comprar ou repor. Use: "Verificar disponibilidade com o responsável pelo estoque para evitar interrupção comercial."
- Nunca cite nomes técnicos do contexto (FACTS, MEMORY, ACTIVE_TESTS, etc.) no texto. Escreva para uma pessoa.
- Custo ausente significa margem desconhecida, nunca margem ruim.

CONFIANÇA
- HIGH: dados completos e evento determinístico claro. MEDIUM: evento válido com incerteza. LOW: dados incompletos (insufficient_data=true).

FORMATO
- No máximo 3 prioridades, na ordem de impacto comercial.
- Ordem de leitura: tráfego → conversão → ticket → preço.
- Em "O QUE IMPORTA", só relacione métricas que estejam comparáveis. Ex.: "O faturamento cresceu apesar da redução de visitas" só se as duas existirem.
- Prefira "Dados insuficientes" a uma conclusão bonita e não comprovada.`

const NO_EVENTS = 'Nenhum evento determinístico relevante foi identificado.'
const NO_TESTS = 'Nenhum teste comercial ativo foi identificado nesta análise.'
const NOT_CLASSIFIED = 'O motor ainda não classificou esse comportamento como evento determinístico.'
const STOCK_SAFE = 'Verificar disponibilidade com o responsável pelo estoque para evitar interrupção comercial.'
const STOCK_FORBIDDEN =
  /\b(programar|fazer|realizar|planejar|agendar)\s+(a\s+|uma\s+|nova\s+)?compra|\brepor\b|\breponha\b|reposi[çc][ãa]o|\bcomprar\s+(\d|mais)|compra\s+de\s+\d/i
const HEDGING = /\b(pode|poderia|podem|provavelmente|possivelmente|talvez|sugere|parece|indica que|deve ser|causad[oa] por|por causa d|o problema é)\b/i
const PRIORITY_WORDS = /\b(prioridade|priorit|risco|gargalo|urgente|recuperar|perda|perdeu|caiu|queda)\b/i
const JARGON = /\b(ACTIVE_TESTS|DETERMINISTIC_FINDINGS|MEMORY|FACTS|UNKNOWN|KNOWN_SKUS|CHANNEL_STATUS|ALERTS|source_event_id|JSON)\b|\bno contexto\b/
const METRIC_LABEL =
  /faturament|receita|pedido|unidade|visita|convers|ticket|pre[çc]o|margem|custo|estoque|R\$|p\.p\.|prioridade|teste|produto|an[úu]ncio|dia|semana|alerta|evento|sku/i
const DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g

const METRIC_WORDS: [RegExp, MetricKey][] = [
  [/\bvisitas?\b|tr[áa]fego/i, 'visits'],
  [/convers[ãa]o/i, 'conversion'],
  [/ticket/i, 'average_ticket'],
  [/faturamento|receita/i, 'revenue'],
  [/\bpedidos?\b/i, 'orders'],
]

const STATUS_WORDS: Record<string, RegExp> = {
  'SAUDÁVEL': /saud[áa]vel/i,
  'ATENÇÃO': /em aten[çc][ãa]o|\baten[çc][ãa]o\b/i,
  'CRÍTICO': /cr[íi]tic[oa]/i,
  'DADOS INSUFICIENTES': /dados insuficientes/i,
}

type Token = { raw: string; value: number }

/** Numbers written in pt-BR or plain format: "R$ 5.800,50", "12,5%", "1234.5". Dates and SKUs are ignored. */
function extractNumbers(text: string, skus: string[]): Token[] {
  let cleaned = text
    .replace(/\d{4}-\d{2}-\d{2}/g, ' ')
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ')
    .replace(/\b(?:SKU|MLB)[\s:-]*[A-Z0-9.-]+/gi, ' ')
  for (const sku of skus) cleaned = cleaned.split(sku).join(' ')
  const out: Token[] = []
  for (const m of cleaned.matchAll(/-?\d[\d.,]*/g)) {
    const token = m[0].replace(/[.,]$/, '')
    // Fragments of a product code (e.g. "303" from "4906.303") are identifiers, not metrics.
    if (skus.some((s) => s.includes(token))) continue
    let raw = token
    if (/,\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '')
    else raw = raw.replace(/,/g, '')
    const v = Number(raw)
    if (Number.isFinite(v)) out.push({ raw: token, value: Math.abs(v) })
  }
  return out
}

function collectNumbers(value: unknown, skus: string[], acc: number[] = []): number[] {
  if (typeof value === 'number') acc.push(Math.abs(value))
  else if (typeof value === 'string') acc.push(...extractNumbers(value, skus).map((t) => t.value))
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, skus, acc))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, skus, acc))
  return acc
}

const matches = (known: number[], v: number) => known.some((k) => Math.abs(k - v) <= Math.max(0.06, Math.abs(k) * 0.01))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

type CleanOpts = { section: string; allowFutureDates?: boolean; requireEventSku?: boolean; noNumbers?: boolean; checkMetrics?: boolean }
type SourceEvent = { id: string; sku: string | null; fact: string; action: string }

/**
 * Final gate before a reading is saved. Numeric sections are rendered from the structured context; the
 * model's text is checked sentence by sentence and anything without a verifiable origin is removed.
 */
function validateAnalysis(ai: DailyAnalysisAI, ctx: DailyContext): { analysis: DailyAnalysis; validation: AIValidation } {
  const knownSkus = [...ctx.KNOWN_SKUS].sort((a, b) => b.length - a.length)
  const known = collectNumbers(ctx, knownSkus)
  const memoryNumbers = collectNumbers(ctx.MEMORY, knownSkus)
  const findingNumbers = collectNumbers([ctx.DETERMINISTIC_FINDINGS, ctx.ALERTS], knownSkus)
  const diagnostics: ValidationDiagnostic[] = []
  const insufficient = new Set<string>()
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
  const channelNames = ctx.FACTS.channels.map((c) => c.canal)

  const canonicalSku = (text: string) =>
    knownSkus.reduce((t, sku) => t.replace(new RegExp(`\\b[A-Z]{2,6}-(${escapeRe(sku)})(?![\\w.])`, 'g'), '$1'), text)

  const originOf = (v: number) =>
    matches(memoryNumbers, v)
      ? 'memória histórica citada sem identificação'
      : matches(findingNumbers, v)
        ? 'evento do motor citado sem rótulo'
        : 'métrica do contexto citada sem rótulo'

  const reject = (section: string, text: string, reason: string, number: string | null = null, origin = 'IA') => {
    diagnostics.push({ section, text, number, reason, origin })
    return false
  }

  const metricAvailable = (key: MetricKey, sentence: string) => {
    const mentioned = ctx.FACTS.channels.filter((c) => sentence.includes(c.canal))
    const pool = mentioned.length ? mentioned : ctx.FACTS.channels
    return pool.some((c) => (c.metrics as MetricSet)[key].comparable)
  }

  const sentenceOk = (s: string, o: CleanOpts) => {
    if (JARGON.test(s)) return reject(o.section, s, 'termo técnico interno no texto')
    const tokens = extractNumbers(s, knownSkus)
    if (o.noNumbers && tokens.length) return reject(o.section, s, 'número em campo que deve ser apenas texto', tokens[0].raw)
    for (const t of tokens) {
      if (t.value > 10 && !matches(known, t.value)) {
        return reject(o.section, s, 'número não existe em nenhum campo do contexto (provável cálculo da IA)', t.raw, 'IA: cálculo próprio ou mistura de valores')
      }
    }
    if (tokens.length && !METRIC_LABEL.test(s)) {
      return reject(o.section, s, 'número sem nome de métrica', tokens[0].raw, originOf(tokens[0].value))
    }
    if (!o.allowFutureDates && !/revis|reavali/i.test(s) && datesIn(s).some((d) => d > ctx.today)) {
      return reject(o.section, s, 'data futura fora do período analisado')
    }
    for (const status of ctx.CHANNEL_STATUS) {
      if (!s.includes(status.canal)) continue
      const claimed = Object.entries(STATUS_WORDS).filter(([, re]) => re.test(s)).map(([k]) => k)
      if (claimed.length && !claimed.includes(status.status)) {
        return reject(o.section, s, `status de canal diferente do motor (motor: ${status.status})`)
      }
    }
    if (o.requireEventSku && PRIORITY_WORDS.test(s)) {
      const cited = knownSkus.filter((sku) => s.includes(sku))
      if (cited.some((sku) => !eventSkus.has(sku))) return reject(o.section, s, 'prioridade em SKU sem evento determinístico')
    }
    if (o.checkMetrics) {
      const missing = METRIC_WORDS.filter(([re, key]) => re.test(s) && !metricAvailable(key, s)).map(([, key]) => METRIC_NAME[key].toLowerCase())
      if (missing.length) {
        insufficient.add(
          missing.length > 1
            ? `Não há dados suficientes para avaliar a relação entre ${missing.join(' e ')}.`
            : `Não há dados suficientes para avaliar ${missing[0]}.`,
        )
        return reject(o.section, s, `métrica sem dados comparáveis: ${missing.join(', ')}`)
      }
    }
    return true
  }

  const clean = (text: string | null | undefined, o: CleanOpts) => {
    if (!text) return null
    let t = canonicalSku(text.trim())
    if (STOCK_FORBIDDEN.test(t)) t = STOCK_SAFE
    const sentences = splitSentences(t)
    const kept = sentences.filter((s) => sentenceOk(s, o))
    if (kept.length < sentences.length) dropped++
    return kept.length ? kept.join(' ') : null
  }

  const cleanList = (list: string[], o: CleanOpts & { noHedging?: boolean }) => {
    const out: string[] = []
    for (const item of list) {
      const c = clean(item, o)
      if (!c) continue
      if (o.noHedging && HEDGING.test(c)) {
        reject(o.section, c, 'hipótese escrita como fato')
        continue
      }
      if (!out.includes(c)) out.push(c)
    }
    return out
  }

  // Priorities: only from deterministic events.
  const usedSources = new Set<string>()
  const priorities: DailyAnalysis['priorities'] = []
  for (const p of ai.priorities) {
    const source = events.get(p.source_event_id)
    if (!source || usedSources.has(source.id) || !p.respects_tests_and_memory) {
      droppedPriorities++
      continue
    }
    const sku = source.sku ?? (p.sku && ctx.KNOWN_SKUS.includes(canonicalSku(p.sku)) ? canonicalSku(p.sku) : null)
    if (p.sku && !source.sku && !sku) unknownSkus.add(p.sku)

    let fact = clean(p.fact, { section: 'prioridade.fato' })
    if (!fact || HEDGING.test(fact)) fact = source.fact
    const action = clean(p.action, { section: 'prioridade.ação' }) ?? (source.action || null)
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
      title: clean(p.title, { section: 'prioridade.título' }) ?? source.fact.slice(0, 80),
      fact,
      interpretation: clean(p.interpretation, { section: 'prioridade.interpretação' }) ?? 'Dados insuficientes para interpretar este evento.',
      hypothesis: clean(p.hypothesis, { section: 'prioridade.hipótese' }),
      action,
      metric: clean(p.metric, { section: 'prioridade.métrica' }) ?? 'Dados insuficientes.',
      review_date: review,
    })
  }
  if (droppedPriorities) warnings.push(`${droppedPriorities} prioridade(s) da IA removida(s): sem evento determinístico de origem ou com evidência inválida.`)

  let summary = clean(ai.summary, { section: 'resumo', requireEventSku: true, checkMetrics: true })
  let mainBottleneck = hasEvents ? clean(ai.main_bottleneck, { section: 'gargalo', requireEventSku: true, checkMetrics: true }) : null
  if (!hasEvents) summary = NO_EVENTS
  else if (!summary) summary = 'Dados insuficientes para um resumo confiável. Veja os eventos do motor acima.'
  if (mainBottleneck && HEDGING.test(mainBottleneck) && !/hip[óo]tese/i.test(mainBottleneck)) mainBottleneck = null

  // O QUE MUDOU: rendered entirely from the structured metrics.
  const changes: ChangeGroup[] = ctx.FACTS.channels.map((c) => ({
    source: c.canal,
    period_current: ctx.period.label,
    period_previous: ctx.comparisonPeriod.label,
    rows: METRIC_KEYS.map((key) => {
      const m = (c.metrics as MetricSet)[key]
      const line = metricLine(m)
      return m.comparable
        ? { name: m.name, from: line.previous, to: line.current, delta: line.delta, note: null }
        : { name: m.name, from: null, to: null, delta: null, note: m.not_comparable_reason }
    }),
  }))

  const productFor = (sku: string, canal: string) => {
    const s = canonicalSku(sku)
    return ctx.FACTS.products.find((p) => p.sku === s && p.canal === canal) ?? ctx.FACTS.products.find((p) => p.sku === s) ?? null
  }

  // Possible signals: the model only names the product; numbers come from the context.
  const signalCards: SignalCard[] = []
  for (const sg of ai.signals_to_investigate ?? []) {
    const product = productFor(sg.sku, sg.canal)
    if (!product) {
      unknownSkus.add(sg.sku)
      reject('sinais', sg.sku, 'SKU ou canal inexistente no contexto')
      continue
    }
    if (eventSkus.has(product.sku) || signalCards.some((c) => c.sku === product.sku && c.canal === product.canal)) continue
    const m = product.metrics as MetricSet
    signalCards.push({
      sku: product.sku,
      produto: product.produto,
      canal: product.canal,
      lines: (['orders', 'visits', 'revenue'] as MetricKey[]).filter((k) => m[k].current !== null || m[k].previous !== null).map((k) => metricLine(m[k])),
      observacao: clean(sg.observacao, { section: 'sinais.observação', noNumbers: true }),
      motivo: NOT_CLASSIFIED,
    })
  }

  const opportunityCards: OpportunityCard[] = []
  for (const op of ai.opportunities ?? []) {
    const product = op.sku ? productFor(op.sku, op.canal) : null
    const channel = ctx.FACTS.channels.find((c) => c.canal === op.canal)
    if (op.sku && !product) {
      unknownSkus.add(op.sku)
      reject('oportunidades', op.sku, 'SKU inexistente no contexto')
      continue
    }
    const metrics = (product?.metrics ?? channel?.metrics) as MetricSet | undefined
    const metric = metrics?.[op.metric]
    if (!metric || !metric.comparable) {
      reject('oportunidades', `${op.sku ?? op.canal} · ${op.metric}`, 'métrica sem dados comparáveis para sustentar a oportunidade')
      continue
    }
    if (product && testedSkus.has(product.sku)) continue
    opportunityCards.push({
      sku: product?.sku ?? null,
      produto: product?.produto ?? null,
      canal: product?.canal ?? op.canal,
      line: metricLine(metric),
      period: `${metric.period_previous} vs. ${metric.period_current}`,
      interpretacao:
        clean(op.interpretacao, { section: 'oportunidades.interpretação', noNumbers: true }) ??
        'A métrica apresentou mudança, mas ainda não há evidência suficiente para recomendar alteração comercial.',
      motivo: clean(op.motivo, { section: 'oportunidades.motivo', noNumbers: true }) ?? 'Monitorar a evolução da métrica.',
    })
  }

  // Tests and "do not touch" come from stored facts, never from the model.
  const tests = ctx.ACTIVE_TESTS.length
    ? ctx.ACTIVE_TESTS.map(
        (t) =>
          `Teste #${String(t.id).padStart(4, '0')} · ${t.produto}${t.sku ? ` (${t.sku})` : ''} · ${t.variavel}: ${t.de ?? '—'} → ${t.para ?? '—'} · ${
            t.status === 'ready_for_review' ? 'pronto para decisão' : `em andamento até ${brDate(t.avaliacao)}`
          }.`,
      )
    : [NO_TESTS]

  const doNotTouch = [
    ...ctx.ACTIVE_TESTS.filter((t) => t.status === 'in_progress').map(
      (t) => `${t.produto}: não alterar ${t.variavel} até ${brDate(t.avaliacao)}, porque há um teste ativo.`,
    ),
    ...ctx.MEMORY.filter((m) => m.congela_alteracoes).map(
      (m) => `${m.produto ?? m.assunto}: alteração não recomendada porque existe uma decisão registrada na memória (${brDate(String(m.data).slice(0, 10))}).`,
    ),
  ]

  const whatMatters = [...cleanList(ai.what_matters, { section: 'o que importa', requireEventSku: true, checkMetrics: true }), ...insufficient]
  const hypotheses = cleanList(ai.hypotheses, { section: 'hipóteses' }).map((h) => (/^hip[óo]tese/i.test(h) ? h : `Hipótese: ${h}`))

  let confidence = ai.confidence
  const cap = (level: 'MEDIUM' | 'LOW') => {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const
    if (order[confidence] > order[level]) confidence = level
  }
  const incompleteData = ctx.UNKNOWN.some((u) => /incomplet|Nenhuma regra|Nenhum canal/i.test(u.dado))
  if (ai.insufficient_data) cap('LOW')
  if (!hasEvents || incompleteData || dropped > 0 || droppedPriorities > 0) cap('MEDIUM')

  const removedNumbers = diagnostics.filter((d) => d.number !== null).length
  if (diagnostics.length) {
    console.warn('[alure] AI reading validation removed items:', diagnostics.length, JSON.stringify(diagnostics.slice(0, 10)))
  }

  return {
    analysis: {
      summary,
      main_bottleneck: mainBottleneck,
      priorities,
      what_matters: whatMatters,
      hypotheses,
      tests,
      do_not_touch: doNotTouch,
      review_period: `Período analisado: ${ctx.period.label} · comparado com ${ctx.comparisonPeriod.label}`,
      confidence,
      insufficient_data: ai.insufficient_data || confidence === 'LOW',
      changes,
      signal_cards: signalCards,
      opportunity_cards: opportunityCards,
      pending_cards: ctx.UNKNOWN,
    },
    validation: {
      schema: 'ok',
      unverifiedNumbers: [...new Set(diagnostics.map((d) => d.number).filter((n): n is string => n !== null))],
      droppedItems: dropped,
      droppedPriorities,
      unknownSkus: [...unknownSkus],
      warnings,
      removedNumbers,
      diagnostics: diagnostics.slice(0, 50),
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

    const { engineTrace: _trace, dataQuality: _quality, ...modelContext } = context
    const result = await runStructuredTask({
      task: 'DAILY_ANALYSIS',
      schema: dailyAnalysisSchema,
      taskInstructions: DAILY_INSTRUCTIONS,
      prompt: `CONTEXTO (JSON):\n${JSON.stringify(modelContext)}`,
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

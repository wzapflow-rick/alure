import { daysBetween, formatBRL, formatInt, formatPct } from '@/lib/format'
import type { PricingResult } from '@/lib/pricing/engine'
import type { EngineSettings } from '@/lib/settings'

export type EvidenceLabel = 'FATO' | 'INTERPRETAÇÃO' | 'HIPÓTESE'
export type Evidence = { label: EvidenceLabel; text: string }
/** Raw values from PostgreSQL behind a signal — rendered in "Ver evidências". */
export type EvidenceDatum = { label: string; value: string }

export type Severity = 'critical' | 'attention' | 'info' | 'positive'
export type Kind = 'priority' | 'opportunity' | 'test_review' | 'no_action'
export type ActionType = 'information' | 'recommendation' | 'approval_required'
export type Confidence = 'low' | 'medium' | 'high'

export type Classification =
  | 'motor_de_giro'
  | 'produto_de_margem'
  | 'alto_ticket'
  | 'em_teste'
  | 'sazonal'
  | 'observacao'
  | 'sem_classificacao'

export type Signal = {
  fingerprint: string
  ruleCode: string
  kind: Kind
  severity: Severity
  actionType: ActionType
  confidence: Confidence
  score: number
  productId: number | null
  productChannelId: number | null
  marketplaceId: number | null
  experimentId: number | null
  title: string
  issue: string
  evidence: Evidence[]
  data: EvidenceDatum[]
  /** The ACTION. */
  recommendation: string
  reason: string
  objective: string
  /** Changes something commercial — held back while a test is running. */
  suggestsChange: boolean
  alert?: { type: string; severity: Severity; message: string }
  /** Every transformation applied after the rule fired — stored in the run trace. */
  trace?: string[]
}

/** Separates what can move sales from what only needs attention or data. */
export type Category = 'commercial' | 'operational' | 'pending_data' | 'info'

export const CATEGORY_LABEL: Record<Category, string> = {
  commercial: 'Prioridade comercial',
  operational: 'Alerta operacional',
  pending_data: 'Dado pendente',
  info: 'Informação',
}

/** MÉTRICA and PERÍODO for each rule: how we will know the action worked, and when to look again. */
export const RULE_META: Record<string, { category: Category; metric: string; reviewDays: number }> = {
  RH_INSUFFICIENT_DATA: { category: 'info', metric: 'Dias de histórico sincronizado', reviewDays: 7 },
  R1_STALLED: { category: 'commercial', metric: 'Pedidos e visitas diárias do anúncio', reviewDays: 3 },
  R2_TRAFFIC_PROBLEM: { category: 'commercial', metric: 'Visitas, pedidos e conversão', reviewDays: 7 },
  R2B_TRAFFIC_AND_CONVERSION: { category: 'commercial', metric: 'Visitas primeiro; depois conversão e pedidos', reviewDays: 7 },
  R3_CONVERSION_PROBLEM: { category: 'commercial', metric: 'Conversão e pedidos com tráfego estável', reviewDays: 7 },
  R3L_LOW_CONVERSION: { category: 'info', metric: 'Conversão do próprio anúncio', reviewDays: 14 },
  R2S_SALES_DROP: { category: 'commercial', metric: 'Pedidos e visitas (quando sincronizadas)', reviewDays: 7 },
  R6_TICKET_DROP: { category: 'commercial', metric: 'Faturamento, ticket médio e unidades por pedido', reviewDays: 7 },
  R4_LOW_MARGIN: { category: 'operational', metric: 'Margem de contribuição por unidade', reviewDays: 14 },
  R5_MOMENTUM: { category: 'info', metric: 'Pedidos, conversão e estoque', reviewDays: 7 },
  R9_PROMO_TEST: { category: 'commercial', metric: 'Pedidos e margem durante a promoção', reviewDays: 14 },
  R8_MISSING_DATA: { category: 'pending_data', metric: 'Cadastro completo de custo e taxas', reviewDays: 7 },
  R7_TEST_REVIEW: { category: 'commercial', metric: 'Pedidos, visitas e conversão antes × durante', reviewDays: 0 },
}

export function ruleMeta(ruleCode: string) {
  return RULE_META[ruleCode] ?? { category: 'info' as Category, metric: 'Pedidos e visitas', reviewDays: 7 }
}

export type StrategicMemory = { id: number; productId: number; kind: string; subject: string; decision: string }

/** A registered decision that freezes commercial changes on the product. */
const FREEZE_PATTERN = /n[ãa]o\s+(alterar|mexer|mudar|reduzir|aumentar|baixar|subir)|congel|manter\s+(o\s+)?(pre[çc]o|an[úu]ncio)|at[ée]\s+o\s+fim\s+do\s+teste/i

export function isFreezeMemory(m: StrategicMemory) {
  return FREEZE_PATTERN.test(`${m.subject} ${m.decision}`)
}

export type ChannelStats = {
  productChannelId: number
  productId: number
  marketplaceId: number
  marketplaceName: string
  productName: string
  sku: string
  classification: Classification
  price: number
  windowDays: number
  ordersCur: number
  ordersPrev: number
  revenueCur: number
  revenuePrev: number
  ordersBase: number
  revenueBase: number
  /** Days of the baseline window covered by synced history. */
  baseDays: number
  visitsCur: number | null
  visitsPrev: number | null
  visitsBase: number | null
  trafficBaseDays: number
  historyDays: number
  lastSaleDate: string | null
  saleDays90: number
  observedDays90: number
  lastPriceChange: { date: string; previous: number | null; price: number } | null
  pricing: PricingResult
}

export type ActiveExperiment = {
  id: number
  productId: number
  productChannelId: number | null
  variable: string
  previousValue: string
  newValue: string
  startDate: string
  evaluationDate: string
  status: string
  hypothesis: string
  comparison: ExperimentComparison | null
}

export type ExperimentComparison = {
  days: number
  ordersBefore: number
  ordersDuring: number
  visitsBefore: number | null
  visitsDuring: number | null
}

/** How each strategic class is judged. */
type Profile = {
  label: string
  /** Multiplier over the product's normal sale interval before calling it stalled. */
  stallFactor: number
  /** Multiplier over the configured "dias sem venda" floor. */
  stallFloorMult: number
  /** Order-volume rules (traffic, conversion, momentum) are central for this class. */
  volumeDriven: boolean
  /** Only surface — never push action. */
  monitorOnly: boolean
  maxConfidence: Confidence
}

export const PROFILES: Record<Classification, Profile> = {
  motor_de_giro: { label: 'Motor de giro', stallFactor: 2, stallFloorMult: 1, volumeDriven: true, monitorOnly: false, maxConfidence: 'high' },
  produto_de_margem: { label: 'Produto de margem', stallFactor: 2.5, stallFloorMult: 1.5, volumeDriven: false, monitorOnly: false, maxConfidence: 'high' },
  alto_ticket: { label: 'Alto ticket', stallFactor: 3, stallFloorMult: 4, volumeDriven: false, monitorOnly: false, maxConfidence: 'high' },
  em_teste: { label: 'Em teste', stallFactor: 3, stallFloorMult: 2, volumeDriven: false, monitorOnly: true, maxConfidence: 'medium' },
  sazonal: { label: 'Sazonal', stallFactor: 4, stallFloorMult: 4, volumeDriven: false, monitorOnly: false, maxConfidence: 'low' },
  observacao: { label: 'Observação', stallFactor: 3, stallFloorMult: 2, volumeDriven: false, monitorOnly: true, maxConfidence: 'medium' },
  sem_classificacao: { label: 'Sem classificação', stallFactor: 2.5, stallFloorMult: 1.5, volumeDriven: true, monitorOnly: false, maxConfidence: 'medium' },
}

const SEVERITY_BASE: Record<Severity, number> = { critical: 100, attention: 60, positive: 50, info: 20 }
const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }
const MIN_BASELINE_DAYS = 14
/** Rules whose conclusion depends on sample size; weak evidence becomes "monitorar". */
const SAMPLE_SENSITIVE = new Set(['R1_STALLED', 'R2_TRAFFIC_PROBLEM', 'R3_CONVERSION_PROBLEM', 'R3L_LOW_CONVERSION', 'R2S_SALES_DROP', 'R5_MOMENTUM', 'R9_PROMO_TEST'])

function pctChange(cur: number, ref: number) {
  if (ref <= 0) return null
  return ((cur - ref) / ref) * 100
}

function capConfidence(c: Confidence, max: Confidence): Confidence {
  return CONF_RANK[c] > CONF_RANK[max] ? max : c
}

function score(severity: Severity, revenueAtStake: number) {
  return SEVERITY_BASE[severity] + Math.min(30, Math.round(revenueAtStake / 1000))
}

function fmtDays(n: number) {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia${n === 1 ? '' : 's'}`
}

function fmtDate(iso: string) {
  return iso.split('-').reverse().join('/')
}

/** Baseline reference scaled to the current window, or null when history is too short. */
export function baselineFor(c: ChannelStats) {
  const w = c.windowDays
  const orders = c.baseDays >= MIN_BASELINE_DAYS ? (c.ordersBase / c.baseDays) * w : null
  const visits =
    c.visitsBase !== null && c.trafficBaseDays >= MIN_BASELINE_DAYS ? (c.visitsBase / c.trafficBaseDays) * w : null
  const conversion = orders !== null && visits !== null && visits > 0 ? (orders / visits) * 100 : null
  const saleInterval = c.saleDays90 >= 3 ? c.observedDays90 / c.saleDays90 : null
  return { orders, visits, conversion, saleInterval, days: c.baseDays }
}

export function evaluateChannel(c: ChannelStats, s: EngineSettings, today: string): Signal[] {
  const profile = PROFILES[c.classification] ?? PROFILES.sem_classificacao
  const signals: Signal[] = []
  const w = c.windowDays
  const base = baselineFor(c)
  const title = `${c.productName} · ${c.marketplaceName}`
  const ids = { productId: c.productId, productChannelId: c.productChannelId, marketplaceId: c.marketplaceId, experimentId: null }
  const conversion = c.visitsCur && c.visitsCur > 0 ? (c.ordersCur / c.visitsCur) * 100 : null
  const ordersVsBase = base.orders !== null ? pctChange(c.ordersCur, base.orders) : null
  const visitsVsBase = base.visits !== null && c.visitsCur !== null ? pctChange(c.visitsCur, base.visits) : null
  const convVsBase = base.conversion !== null && conversion !== null ? pctChange(conversion, base.conversion) : null
  const baseLabel = `média dos ${base.days} dias anteriores à janela`
  const sig = s.significantChangePct

  const ticketCur = c.ordersCur > 0 ? c.revenueCur / c.ordersCur : null
  const ticketPrev = c.ordersPrev > 0 ? c.revenuePrev / c.ordersPrev : null
  const commonData: EvidenceDatum[] = [
    { label: 'Classificação', value: profile.label },
    { label: 'Preço atual', value: formatBRL(c.price) },
    { label: 'Janela analisada', value: `${w} dias` },
    { label: 'Histórico sincronizado', value: fmtDays(c.historyDays) },
    { label: `Pedidos (${w}d) · anterior`, value: `${formatInt(c.ordersCur)} · ${formatInt(c.ordersPrev)}` },
    { label: `Faturamento (${w}d) · anterior`, value: `${formatBRL(c.revenueCur)} · ${formatBRL(c.revenuePrev)}` },
    ...(ticketCur !== null || ticketPrev !== null
      ? [{ label: 'Ticket médio · anterior', value: `${ticketCur !== null ? formatBRL(ticketCur) : '—'} · ${ticketPrev !== null ? formatBRL(ticketPrev) : '—'}` }]
      : []),
    ...(c.visitsCur !== null && c.visitsPrev !== null
      ? [{ label: `Visitas (${w}d) · anterior`, value: `${formatInt(c.visitsCur)} · ${formatInt(c.visitsPrev)}` }]
      : []),
    { label: `Pedidos esperados pela base`, value: base.orders !== null ? base.orders.toFixed(1) : 'sem base' },
    ...(base.visits !== null ? [{ label: 'Visitas esperadas pela base', value: formatInt(Math.round(base.visits)) }] : []),
    ...(conversion !== null ? [{ label: 'Conversão atual', value: formatPct(conversion) }] : []),
    ...(base.conversion !== null ? [{ label: 'Conversão de base', value: formatPct(base.conversion) }] : []),
    ...(c.lastSaleDate ? [{ label: 'Última venda', value: fmtDate(c.lastSaleDate) }] : []),
    ...(base.saleInterval !== null ? [{ label: 'Intervalo normal entre vendas', value: fmtDays(base.saleInterval) }] : []),
    ...(c.lastPriceChange
      ? [{
          label: 'Última mudança de preço',
          value: `${fmtDate(c.lastPriceChange.date)} · ${c.lastPriceChange.previous !== null ? `${formatBRL(c.lastPriceChange.previous)} → ` : ''}${formatBRL(c.lastPriceChange.price)}`,
        }]
      : []),
  ]

  // H — dados insuficientes para qualquer julgamento comercial
  if (c.historyDays < s.minHistoryDays) {
    signals.push({
      ...ids,
      fingerprint: `RH:${c.productChannelId}`,
      ruleCode: 'RH_INSUFFICIENT_DATA',
      kind: 'no_action',
      severity: 'info',
      actionType: 'information',
      confidence: 'high',
      score: 10,
      title,
      issue: `Histórico de ${fmtDays(c.historyDays)} — abaixo dos ${s.minHistoryDays} dias necessários.`,
      evidence: [
        { label: 'FATO', text: `Primeiro dado sincronizado há ${fmtDays(c.historyDays)}.` },
        { label: 'INTERPRETAÇÃO', text: 'Não há base suficiente para separar variação normal de problema real.' },
      ],
      data: commonData,
      recommendation: 'Nenhuma ação. Continuar sincronizando e monitorar.',
      reason: 'Decidir com amostra pequena tende a corrigir o que não estava quebrado.',
      objective: 'Formar a base histórica do produto.',
      suggestsChange: false,
    })
  }

  // A — produto parado (contextual ao ritmo normal e à classificação)
  if (c.historyDays >= s.minHistoryDays && c.lastSaleDate) {
    const days = daysBetween(c.lastSaleDate, today)
    const floor = s.daysWithoutSale * profile.stallFloorMult
    const threshold = base.saleInterval !== null ? Math.max(floor, base.saleInterval * profile.stallFactor) : floor * 2
    if (days >= threshold) {
      const severity: Severity = days >= threshold * 2 && !profile.monitorOnly ? 'critical' : 'attention'
      signals.push({
        ...ids,
        fingerprint: `R1:${c.productChannelId}`,
        ruleCode: 'R1_STALLED',
        kind: 'priority',
        severity,
        actionType: 'recommendation',
        confidence: base.saleInterval !== null ? capConfidence(c.saleDays90 >= 10 ? 'high' : 'medium', profile.maxConfidence) : 'low',
        score: score(severity, c.revenuePrev),
        title,
        issue:
          base.saleInterval !== null
            ? `Normalmente vende a cada ${fmtDays(base.saleInterval)} e está há ${fmtDays(days)} sem venda.`
            : `Sem venda há ${fmtDays(days)}; ainda não há ritmo histórico confiável.`,
        evidence: [
          { label: 'FATO', text: `Última venda em ${fmtDate(c.lastSaleDate)}. ${formatInt(c.saleDays90)} dias com venda nos últimos ${c.observedDays90} dias observados.` },
          {
            label: 'INTERPRETAÇÃO',
            text: `Para ${profile.label.toLowerCase()}, o limite considerado é ${fmtDays(Math.round(threshold * 10) / 10)} — o intervalo atual está acima do esperado.`,
          },
          { label: 'HIPÓTESE', text: 'Anúncio pausado, ruptura de estoque, perda de exposição ou concorrente com preço menor.' },
        ],
        data: commonData,
        recommendation: 'Verificar status do anúncio, estoque e exposição antes de qualquer mudança de preço.',
        reason: 'Descartar causas operacionais evita mexer em preço sem necessidade.',
        objective: 'Retomar o ritmo normal de vendas.',
        suggestsChange: false,
        alert: { type: 'stalled', severity, message: `${title}: ${fmtDays(days)} sem venda (normal: ${base.saleInterval !== null ? fmtDays(base.saleInterval) : 'sem base'}).` },
      })
    }
  }

  const trafficFell = visitsVsBase !== null && visitsVsBase <= -sig
  const trafficHealthy = visitsVsBase !== null && visitsVsBase > -sig / 2
  const convHeld = convVsBase !== null && convVsBase > -sig / 2

  // B — problema provável de tráfego: conversão histórica mantida, visitas caíram
  if (trafficFell && convHeld && base.visits !== null && base.visits >= s.minVisitsForConversion) {
    signals.push({
      ...ids,
      fingerprint: `R2T:${c.productChannelId}`,
      ruleCode: 'R2_TRAFFIC_PROBLEM',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence: capConfidence('high', profile.maxConfidence),
      score: score('attention', c.revenuePrev),
      title,
      issue: `Visitas ${formatPct(Math.abs(visitsVsBase!))} abaixo da base, com conversão mantida.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.visitsCur)} visitas em ${w} dias; a ${baseLabel} indica ${formatInt(Math.round(base.visits))}.` },
        { label: 'FATO', text: `Conversão de ${formatPct(conversion ?? 0)} vs ${formatPct(base.conversion ?? 0)} de base.` },
        { label: 'INTERPRETAÇÃO', text: 'O anúncio continua convencendo; chega menos gente até ele.' },
        { label: 'HIPÓTESE', text: 'Perda de posição na busca, orçamento de Ads esgotado ou fim de promoção.' },
      ],
      data: commonData,
      recommendation: 'Revisar exposição e Ads. Não alterar preço.',
      reason: 'Reduzir preço com conversão saudável sacrifica margem sem atacar a causa.',
      objective: 'Recuperar o tráfego da base histórica.',
      suggestsChange: false,
      alert: { type: 'traffic_drop', severity: 'attention', message: `${title}: visitas ${formatPct(visitsVsBase!, true)} vs base.` },
    })
  }

  // B2 — tráfego e conversão caíram juntos: tráfego vem primeiro na ordem de análise
  if (trafficFell && convVsBase !== null && convVsBase <= -sig && base.visits !== null && base.visits >= s.minVisitsForConversion) {
    signals.push({
      ...ids,
      fingerprint: `R2B:${c.productChannelId}`,
      ruleCode: 'R2B_TRAFFIC_AND_CONVERSION',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence: capConfidence(c.ordersCur + (base.orders ?? 0) >= s.minOrdersHistory * 2 ? 'medium' : 'low', profile.maxConfidence),
      score: score('attention', c.revenuePrev - c.revenueCur),
      title,
      issue: `Visitas ${formatPct(Math.abs(visitsVsBase!))} e conversão ${formatPct(Math.abs(convVsBase))} abaixo da base.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.visitsCur)} visitas em ${w} dias; a ${baseLabel} indica ${formatInt(Math.round(base.visits))}.` },
        { label: 'FATO', text: `Conversão de ${formatPct(conversion ?? 0)} vs ${formatPct(base.conversion ?? 0)} de base.` },
        { label: 'INTERPRETAÇÃO', text: 'Os dois elos caíram; não dá para atribuir a queda a um só. Tráfego é o primeiro a investigar.' },
        { label: 'HIPÓTESE', text: 'Perda de exposição trazendo visitantes menos qualificados, ou mudança competitiva (preço/frete) afetando busca e decisão.' },
      ],
      data: commonData,
      recommendation: 'Investigar exposição (posição, Ads, status) antes de alterar preço ou anúncio.',
      reason: 'Mexer em preço com tráfego em queda mistura duas causas e impede saber o que funcionou.',
      objective: 'Recuperar o tráfego e, então, reavaliar a conversão.',
      suggestsChange: false,
      alert: { type: 'traffic_conversion_drop', severity: 'attention', message: `${title}: visitas ${formatPct(visitsVsBase!, true)} e conversão ${formatPct(convVsBase, true)} vs base.` },
    })
  }

  // Ticket — pedidos estáveis, faturamento em queda: investigar mix, unidades por pedido e preço
  const revenueBaseScaled = c.baseDays >= MIN_BASELINE_DAYS ? (c.revenueBase / c.baseDays) * w : null
  const revenueVsBase = revenueBaseScaled !== null ? pctChange(c.revenueCur, revenueBaseScaled) : null
  if (
    revenueVsBase !== null &&
    revenueVsBase <= -sig &&
    ordersVsBase !== null &&
    ordersVsBase > -sig / 2 &&
    (base.orders ?? 0) >= s.minOrdersHistory &&
    c.ordersCur > 0
  ) {
    const ticketBase = base.orders ? revenueBaseScaled! / base.orders : null
    const priceChangedInWindow = c.lastPriceChange !== null && daysBetween(c.lastPriceChange.date, today) <= w
    signals.push({
      ...ids,
      fingerprint: `R6:${c.productChannelId}`,
      ruleCode: 'R6_TICKET_DROP',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence: capConfidence(c.ordersCur >= s.minOrdersHistory ? 'medium' : 'low', profile.maxConfidence),
      score: score('attention', revenueBaseScaled! - c.revenueCur),
      title,
      issue: `Faturamento ${formatPct(Math.abs(revenueVsBase))} abaixo da base com pedidos estáveis.`,
      evidence: [
        { label: 'FATO', text: `${formatBRL(c.revenueCur)} em ${w} dias; a ${baseLabel} indica ${formatBRL(revenueBaseScaled!)}.` },
        { label: 'FATO', text: `Pedidos ${formatPct(ordersVsBase, true)} vs base; ticket ${ticketCur !== null ? formatBRL(ticketCur) : '—'} vs ${ticketBase !== null ? formatBRL(ticketBase) : '—'} de base.` },
        { label: 'INTERPRETAÇÃO', text: 'O volume se manteve; cada pedido está valendo menos.' },
        {
          label: 'HIPÓTESE',
          text: priceChangedInWindow
            ? `O preço mudou em ${fmtDate(c.lastPriceChange!.date)}; pode estar relacionado — ainda não comprovado.`
            : 'Menos unidades por pedido, variação mais barata vendendo mais ou desconto aplicado.',
        },
      ],
      data: commonData,
      recommendation: 'Verificar unidades por pedido, variações vendidas e descontos antes de qualquer ajuste.',
      reason: 'Queda de ticket com volume estável não é problema de tráfego nem de conversão.',
      objective: 'Identificar o componente do ticket que caiu.',
      suggestsChange: false,
    })
  }

  // C — problema provável de conversão: tráfego saudável, conversão em queda vs base
  // Classes that are not volume-driven need a larger sample before conversion is judged.
  const minVisitsForClass = profile.volumeDriven ? s.minVisitsForConversion : s.highTrafficVisits
  if (trafficHealthy && convVsBase !== null && convVsBase <= -sig && (c.visitsCur ?? 0) >= minVisitsForClass) {
    signals.push({
      ...ids,
      fingerprint: `R3C:${c.productChannelId}`,
      ruleCode: 'R3_CONVERSION_PROBLEM',
      kind: 'priority',
      severity: 'attention',
      actionType: 'approval_required',
      confidence: capConfidence(c.ordersCur + (base.orders ?? 0) >= s.minOrdersHistory * 2 ? 'high' : 'medium', profile.maxConfidence),
      score: score('attention', (base.orders ?? 0) * c.price - c.revenueCur),
      title,
      issue: `Conversão ${formatPct(Math.abs(convVsBase))} abaixo da base do próprio produto.`,
      evidence: [
        { label: 'FATO', text: `Conversão de ${formatPct(conversion ?? 0)} em ${w} dias vs ${formatPct(base.conversion ?? 0)} de base.` },
        { label: 'FATO', text: `Visitas ${visitsVsBase !== null ? formatPct(visitsVsBase, true) : '—'} vs base (tráfego estável).` },
        { label: 'INTERPRETAÇÃO', text: 'As pessoas chegam, mas compram menos — o gargalo está dentro do anúncio.' },
        { label: 'HIPÓTESE', text: 'Concorrente com preço menor, mudança no frete, avaliação negativa ou alteração recente no anúncio.' },
      ],
      data: commonData,
      recommendation: 'Comparar preço e frete com concorrentes e abrir um teste isolando uma única variável.',
      reason: 'Uma variável por vez permite atribuir o resultado com segurança.',
      objective: `Voltar para a conversão de base (${formatPct(base.conversion ?? 0)}).`,
      suggestsChange: true,
      alert: { type: 'conversion_drop', severity: 'attention', message: `${title}: conversão ${formatPct(convVsBase, true)} vs base.` },
    })
  }

  // C' — sem base histórica de conversão: usa o limite configurado como sinal fraco
  if (
    base.conversion === null &&
    c.visitsCur !== null &&
    c.visitsCur >= s.highTrafficVisits &&
    conversion !== null &&
    conversion < s.lowConversionPct
  ) {
    signals.push({
      ...ids,
      fingerprint: `R3L:${c.productChannelId}`,
      ruleCode: 'R3L_LOW_CONVERSION',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence: 'low',
      score: score('attention', c.revenueCur),
      title,
      issue: `Conversão de ${formatPct(conversion)} com ${formatInt(c.visitsCur)} visitas, sem base histórica do produto.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.visitsCur)} visitas e ${formatInt(c.ordersCur)} pedidos em ${w} dias.` },
        { label: 'INTERPRETAÇÃO', text: `Abaixo do sinal configurado (${formatPct(s.lowConversionPct)}), mas sem histórico próprio para confirmar que é anormal.` },
      ],
      data: commonData,
      recommendation: 'Evidência insuficiente. Continuar monitorando até formar a base do produto.',
      reason: 'O limite geral não vale para todo produto; falta a referência do próprio anúncio.',
      objective: 'Confirmar se a conversão é baixa para este produto.',
      suggestsChange: false,
    })
  }

  // Queda de pedidos sem dado de tráfego — não separa exposição de conversão
  if (c.visitsCur === null && ordersVsBase !== null && ordersVsBase <= -sig && (base.orders ?? 0) >= s.minOrdersHistory) {
    signals.push({
      ...ids,
      fingerprint: `R2S:${c.productChannelId}`,
      ruleCode: 'R2S_SALES_DROP',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence: 'low',
      score: score('attention', c.revenuePrev - c.revenueCur),
      title,
      issue: `Pedidos ${formatPct(Math.abs(ordersVsBase))} abaixo da base, sem dado de tráfego.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.ordersCur)} pedidos em ${w} dias; a ${baseLabel} indica ${base.orders!.toFixed(1)}.` },
        { label: 'INTERPRETAÇÃO', text: 'Sem visitas sincronizadas não é possível dizer se o problema é exposição ou conversão.' },
      ],
      data: commonData,
      recommendation: 'Verificar exposição do anúncio no marketplace antes de mudar preço.',
      reason: 'A causa ainda não está identificada.',
      objective: 'Identificar se a queda é de tráfego ou de conversão.',
      suggestsChange: false,
    })
  }

  // F — margem abaixo do mínimo configurado
  if (c.pricing.status === 'ok' && c.pricing.marginPct < s.minMarginPct) {
    const p = c.pricing
    const severity: Severity = p.contributionMargin < 0 ? 'critical' : 'attention'
    signals.push({
      ...ids,
      fingerprint: `R4:${c.productChannelId}`,
      ruleCode: 'R4_LOW_MARGIN',
      kind: 'priority',
      severity,
      actionType: 'approval_required',
      confidence: 'high',
      score: score(severity, c.revenueCur),
      title,
      issue:
        p.contributionMargin < 0
          ? `Margem negativa: ${formatBRL(p.contributionMargin)} por unidade.`
          : `Margem de ${formatPct(p.marginPct)}, abaixo do mínimo de ${formatPct(s.minMarginPct)}.`,
      evidence: [
        { label: 'FATO', text: `Preço ${formatBRL(p.grossPrice)} · taxas ${formatBRL(p.marketplaceFees)} · Ads ${formatBRL(p.adsCost)} · custo ${formatBRL(p.cost)}.` },
        { label: 'FATO', text: `Regra de taxa aplicada: ${p.rule.name}.` },
        {
          label: 'INTERPRETAÇÃO',
          text: p.breakEvenPrice
            ? `Ponto de equilíbrio em ${formatBRL(p.breakEvenPrice)}${p.targetMarginPrice ? `; preço para ${formatPct(p.targetMarginPct)} de margem: ${formatBRL(p.targetMarginPrice)}` : ''}.`
            : 'Não há preço de equilíbrio dentro das faixas de taxa cadastradas.',
        },
      ],
      data: [
        ...commonData,
        { label: 'Custo médio', value: formatBRL(p.cost) },
        { label: 'Taxas do marketplace', value: formatBRL(p.marketplaceFees) },
        { label: 'Ads por unidade', value: formatBRL(p.adsCost) },
        { label: 'Margem de contribuição', value: `${formatBRL(p.contributionMargin)} (${formatPct(p.marginPct)})` },
        { label: 'Margem mínima configurada', value: formatPct(s.minMarginPct) },
      ],
      recommendation: p.targetMarginPrice
        ? `Avaliar reajuste para ${formatBRL(p.targetMarginPrice)} ou redução de Ads/custo.`
        : 'Revisar custo, Ads e regras de taxa deste canal.',
      reason: 'Cada venda abaixo da margem mínima consome caixa.',
      objective: `Voltar para margem de pelo menos ${formatPct(s.minMarginPct)}.`,
      suggestsChange: true,
      alert: { type: 'low_margin', severity, message: `${title}: margem de ${formatPct(p.marginPct)}.` },
    })
  }

  // D — momentum positivo: não interferir
  const convNotFalling = convVsBase === null || convVsBase > -sig / 2
  if (ordersVsBase !== null && ordersVsBase >= sig && c.ordersCur >= s.minOrdersHistory && convNotFalling) {
    signals.push({
      ...ids,
      fingerprint: `R5:${c.productChannelId}`,
      ruleCode: 'R5_MOMENTUM',
      kind: 'opportunity',
      severity: 'positive',
      actionType: 'information',
      confidence: capConfidence(base.days >= 30 ? 'high' : 'medium', profile.maxConfidence),
      score: score('positive', c.revenueCur),
      title,
      issue: `Pedidos ${formatPct(ordersVsBase)} acima da base${convVsBase !== null && convVsBase > 0 ? ' e conversão em alta' : ''}.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.ordersCur)} pedidos em ${w} dias; a ${baseLabel} indica ${base.orders!.toFixed(1)}.` },
        ...(convVsBase !== null
          ? [{ label: 'FATO' as const, text: `Conversão ${formatPct(convVsBase, true)} vs base.` }]
          : []),
        { label: 'INTERPRETAÇÃO', text: 'O produto está ganhando tração — o que está funcionando não deve ser mexido.' },
      ],
      data: commonData,
      recommendation: 'Não interferir. Garantir estoque para sustentar o ritmo.',
      reason: 'Mudar preço ou anúncio durante a aceleração pode quebrar o que está funcionando.',
      objective: 'Sustentar o crescimento sem perder margem.',
      suggestsChange: false,
    })
  }

  // E — oportunidade de testar promoção: margem folgada + demanda histórica + desaceleração moderada
  if (
    c.pricing.status === 'ok' &&
    c.pricing.marginPct >= s.targetMarginPct &&
    (base.orders ?? 0) >= s.minOrdersHistory &&
    ordersVsBase !== null &&
    ordersVsBase <= -sig / 3 &&
    ordersVsBase > -sig &&
    !profile.monitorOnly
  ) {
    const headroom = c.pricing.marginPct - s.minMarginPct
    signals.push({
      ...ids,
      fingerprint: `R9:${c.productChannelId}`,
      ruleCode: 'R9_PROMO_TEST',
      kind: 'opportunity',
      severity: 'positive',
      actionType: 'approval_required',
      confidence: capConfidence('medium', profile.maxConfidence),
      score: score('positive', base.orders! * c.price - c.revenueCur),
      title,
      issue: `Desaceleração de ${formatPct(Math.abs(ordersVsBase))} com margem de ${formatPct(c.pricing.marginPct)}.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.ordersCur)} pedidos vs ${base.orders!.toFixed(1)} esperados pela base.` },
        { label: 'FATO', text: `Margem atual de ${formatPct(c.pricing.marginPct)}; mínimo configurado de ${formatPct(s.minMarginPct)}.` },
        { label: 'INTERPRETAÇÃO', text: `Há ${formatPct(headroom)} de folga de margem para um teste de promoção controlado.` },
        { label: 'HIPÓTESE', text: 'Um desconto temporário pode recuperar o ritmo sem comprometer a margem mínima.' },
      ],
      data: commonData,
      recommendation: 'Testar promoção com prazo definido, sem alterar outras variáveis.',
      reason: 'Demanda histórica comprovada e margem folgada reduzem o risco do teste.',
      objective: 'Recuperar o volume da base mantendo margem acima do mínimo.',
      suggestsChange: true,
    })
  }

  // Dado pendente — só quando a ausência limita uma decisão real (produto que vende)
  if (c.pricing.status !== 'ok' && (c.ordersCur > 0 || c.ordersBase > 0)) {
    signals.push({
      ...ids,
      fingerprint: `R8:${c.productChannelId}:${c.pricing.status}`,
      ruleCode: 'R8_MISSING_DATA',
      kind: 'no_action',
      severity: 'info',
      actionType: 'information',
      confidence: 'high',
      score: 10 + Math.min(20, Math.round((c.revenueCur + c.revenuePrev) / 500)),
      title,
      issue: c.pricing.message,
      evidence: [
        { label: 'FATO', text: c.pricing.message },
        { label: 'FATO', text: `${formatInt(c.ordersCur)} pedidos e ${formatBRL(c.revenueCur)} nos últimos ${w} dias.` },
        { label: 'INTERPRETAÇÃO', text: 'Não impede a leitura de tráfego e conversão; impede apenas avaliar margem e preço.' },
      ],
      data: commonData,
      recommendation:
        c.pricing.status === 'missing_cost' ? 'Cadastrar o custo (lote) do produto.' : 'Cadastrar a regra de taxa vigente deste marketplace.',
      reason: 'Sem esses dados, margem e ponto de equilíbrio não podem ser calculados.',
      objective: 'Completar a base para análise de margem.',
      suggestsChange: false,
    })
  }

  return signals.map((sg) => applyConservatism(sg, profile))
}

/** Weak or monitor-only signals become "continuar monitorando" — the engine can say "do nothing". */
function applyConservatism(sg: Signal, profile: Profile): Signal {
  if (sg.severity === 'critical' || sg.kind === 'no_action' || !SAMPLE_SENSITIVE.has(sg.ruleCode)) return sg
  if (sg.confidence !== 'low' && !profile.monitorOnly) return sg
  return {
    ...sg,
    trace: [
      ...(sg.trace ?? []),
      `Rebaixado de ${sg.kind}/${sg.severity} para monitorar: ${profile.monitorOnly ? `classe ${profile.label} só observa` : 'confiança baixa (amostra pequena)'}.`,
    ],
    kind: 'no_action',
    severity: 'info',
    actionType: 'information',
    score: 15,
    evidence: [
      ...sg.evidence,
      {
        label: 'INTERPRETAÇÃO',
        text: profile.monitorOnly
          ? `Produto classificado como ${profile.label.toLowerCase()}: o sistema apenas observa.`
          : 'Sinal fraco para sustentar uma ação.',
      },
    ],
    recommendation: 'Evidência insuficiente. Continuar monitorando.',
    reason: 'Agir sobre um sinal fraco tende a gerar ruído e mudanças desnecessárias.',
    objective: 'Confirmar o sinal antes de agir.',
    suggestsChange: false,
    alert: undefined,
  }
}

function comparisonData(exp: ActiveExperiment): EvidenceDatum[] {
  const c = exp.comparison
  const rows: EvidenceDatum[] = [
    { label: 'Variável testada', value: exp.variable },
    { label: 'Valor anterior', value: exp.previousValue },
    { label: 'Valor em teste', value: exp.newValue },
    { label: 'Início do teste', value: fmtDate(exp.startDate) },
    { label: 'Data de avaliação', value: fmtDate(exp.evaluationDate) },
  ]
  if (!c) return rows
  const convBefore = c.visitsBefore ? (c.ordersBefore / c.visitsBefore) * 100 : null
  const convDuring = c.visitsDuring ? (c.ordersDuring / c.visitsDuring) * 100 : null
  rows.push(
    { label: 'Dias desde o início', value: fmtDays(c.days) },
    { label: `Pedidos antes (${c.days}d)`, value: formatInt(c.ordersBefore) },
    { label: 'Pedidos durante o teste', value: formatInt(c.ordersDuring) },
    { label: 'Conversão antes', value: convBefore !== null ? formatPct(convBefore) : 'sem dado de tráfego' },
    { label: 'Conversão durante', value: convDuring !== null ? formatPct(convDuring) : 'sem dado de tráfego' },
    { label: 'Tamanho da amostra', value: `${formatInt(c.ordersBefore + c.ordersDuring)} pedidos` },
  )
  return rows
}

/** Protects running tests: change-suggesting signals on the same product are held (critical ones pass). */
export function applyExperimentGuard(signals: Signal[], experiments: ActiveExperiment[], today: string) {
  let protectedCount = 0
  const result = signals.map((signal) => {
    if (!signal.suggestsChange || signal.severity === 'critical') return signal
    const exp = experiments.find(
      (e) =>
        e.status === 'in_progress' &&
        e.productId === signal.productId &&
        (e.productChannelId === null || e.productChannelId === signal.productChannelId),
    )
    if (!exp) return signal
    protectedCount++
    const remaining = Math.max(0, daysBetween(today, exp.evaluationDate))
    return {
      ...signal,
      trace: [...(signal.trace ?? []), `Retido pelo teste #${exp.id} (${exp.variable}) até ${exp.evaluationDate}; ação original: ${signal.recommendation}`],
      kind: 'no_action' as const,
      severity: 'info' as const,
      actionType: 'information' as const,
      experimentId: exp.id,
      score: 30,
      evidence: [
        ...signal.evidence,
        { label: 'FATO' as const, text: `Teste #${String(exp.id).padStart(4, '0')} (${exp.variable}) em andamento até ${fmtDate(exp.evaluationDate)}.` },
      ],
      data: [...signal.data, ...comparisonData(exp)],
      recommendation: `Não interferir no teste atual. Aguardar ${remaining} dia(s) até a avaliação.`,
      reason: 'Mudar outra variável agora invalida a leitura do teste.',
      objective: 'Preservar a integridade do experimento.',
      suggestsChange: false,
      alert: undefined,
    }
  })
  return { signals: result, protectedCount }
}

/** G — teste atingiu a data de avaliação. */
export function experimentReviewSignal(exp: ActiveExperiment, today: string): Signal | null {
  if (daysBetween(exp.evaluationDate, today) < 0) return null
  const c = exp.comparison
  const change = c && c.ordersBefore > 0 ? pctChange(c.ordersDuring, c.ordersBefore) : null
  return {
    fingerprint: `R7:${exp.id}`,
    ruleCode: 'R7_TEST_REVIEW',
    kind: 'test_review',
    severity: 'attention',
    actionType: 'approval_required',
    confidence: c && c.ordersBefore + c.ordersDuring >= 10 ? 'medium' : 'low',
    score: 85,
    productId: exp.productId,
    productChannelId: exp.productChannelId,
    marketplaceId: null,
    experimentId: exp.id,
    title: `Teste #${String(exp.id).padStart(4, '0')} pronto para revisão`,
    issue: `Data de avaliação (${fmtDate(exp.evaluationDate)}) atingida.`,
    evidence: [
      { label: 'FATO', text: `Variável testada: ${exp.variable} (${exp.previousValue} → ${exp.newValue}). Início em ${fmtDate(exp.startDate)}.` },
      ...(c
        ? [{
            label: 'FATO' as const,
            text: `Pedidos: ${formatInt(c.ordersBefore)} antes × ${formatInt(c.ordersDuring)} durante (${c.days} dias cada)${change !== null ? `, ${formatPct(change, true)}` : ''}.`,
          }]
        : []),
      { label: 'HIPÓTESE', text: exp.hypothesis },
    ],
    data: comparisonData(exp),
    recommendation: 'Comparar antes × depois e decidir: manter, reverter, continuar ou novo teste.',
    reason: 'Testes sem decisão viram ruído e bloqueiam novas ações no produto.',
    objective: 'Registrar o aprendizado na memória estratégica.',
    suggestsChange: false,
    alert: { type: 'test_review', severity: 'attention', message: `Teste #${String(exp.id).padStart(4, '0')} atingiu a data de avaliação.` },
  }
}

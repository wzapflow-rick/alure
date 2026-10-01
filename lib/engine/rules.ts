import { daysBetween, formatBRL, formatInt, formatPct } from '@/lib/format'
import type { PricingResult } from '@/lib/pricing/engine'
import type { EngineSettings } from '@/lib/settings'

export type EvidenceLabel = 'FATO' | 'INTERPRETAÇÃO' | 'HIPÓTESE'
export type Evidence = { label: EvidenceLabel; text: string }

export type Severity = 'critical' | 'attention' | 'info' | 'positive'
export type Kind = 'priority' | 'opportunity' | 'test_review' | 'no_action'
export type ActionType = 'information' | 'recommendation' | 'approval_required'
export type Confidence = 'low' | 'medium' | 'high'

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
  recommendation: string
  reason: string
  objective: string
  /** Changes something commercial — must be suppressed while a test is running. */
  suggestsChange: boolean
  alert?: { type: string; severity: Severity; message: string }
}

export type ChannelStats = {
  productChannelId: number
  productId: number
  marketplaceId: number
  marketplaceName: string
  productName: string
  sku: string
  ordersCur: number
  ordersPrev: number
  revenueCur: number
  revenuePrev: number
  visitsCur: number | null
  visitsPrev: number | null
  historyDays: number
  lastSaleDate: string | null
  pricing: PricingResult
}

export type ActiveExperiment = {
  id: number
  productId: number
  productChannelId: number | null
  variable: string
  startDate: string
  evaluationDate: string
  status: string
  hypothesis: string
}

const SEVERITY_BASE: Record<Severity, number> = { critical: 100, attention: 60, positive: 50, info: 20 }

function pctChange(cur: number, prev: number) {
  if (prev === 0) return null
  return ((cur - prev) / prev) * 100
}

function confidenceFor(historyDays: number, s: EngineSettings): Confidence {
  if (historyDays >= s.minHistoryDays * 2) return 'high'
  if (historyDays >= s.minHistoryDays) return 'medium'
  return 'low'
}

function score(severity: Severity, revenueAtStake: number) {
  return SEVERITY_BASE[severity] + Math.min(30, Math.round(revenueAtStake / 1000))
}

function label(c: ChannelStats) {
  return `${c.productName} · ${c.marketplaceName}`
}

export function evaluateChannel(
  c: ChannelStats,
  s: EngineSettings,
  today: string,
): Signal[] {
  const signals: Signal[] = []
  const w = s.windowDays
  const base = {
    productId: c.productId,
    productChannelId: c.productChannelId,
    marketplaceId: c.marketplaceId,
    experimentId: null,
  }
  const enoughHistory = c.historyDays >= s.minHistoryDays
  const confidence = confidenceFor(c.historyDays, s)
  const ordersChange = pctChange(c.ordersCur, c.ordersPrev)
  const visitsChange =
    c.visitsCur !== null && c.visitsPrev !== null ? pctChange(c.visitsCur, c.visitsPrev) : null
  const conversion =
    c.visitsCur && c.visitsCur > 0 ? (c.ordersCur / c.visitsCur) * 100 : null

  // R1 — produto sem venda há X dias
  if (enoughHistory && c.lastSaleDate) {
    const days = daysBetween(c.lastSaleDate, today)
    if (days >= s.daysWithoutSale) {
      const severity: Severity = days >= s.daysWithoutSale * 2 ? 'critical' : 'attention'
      signals.push({
        ...base,
        fingerprint: `R1:${c.productChannelId}`,
        ruleCode: 'R1_NO_SALES',
        kind: 'priority',
        severity,
        actionType: 'recommendation',
        confidence,
        score: score(severity, c.revenuePrev),
        title: label(c),
        issue: `Sem venda há ${days} dias.`,
        evidence: [
          { label: 'FATO', text: `Última venda registrada em ${c.lastSaleDate}.` },
          { label: 'FATO', text: `${formatInt(c.ordersPrev)} pedidos nos ${w} dias anteriores à janela atual.` },
          ...(visitsChange !== null
            ? [{ label: 'FATO' as const, text: `Visitas na janela: ${formatInt(c.visitsCur)} (${formatPct(visitsChange, true)}).` }]
            : []),
          { label: 'INTERPRETAÇÃO', text: 'O produto vendia regularmente e parou — interrupção acima do limite configurado.' },
          { label: 'HIPÓTESE', text: 'Anúncio pausado, ruptura de estoque, perda de exposição ou concorrente com preço menor.' },
        ],
        recommendation: 'Verificar status do anúncio, estoque e exposição antes de qualquer alteração de preço.',
        reason: 'Descartar causas operacionais evita mudar preço sem necessidade.',
        objective: 'Retomar vendas identificando a causa real da interrupção.',
        suggestsChange: false,
        alert: { type: 'no_sales', severity, message: `${label(c)}: sem venda há ${days} dias.` },
      })
    }
  }

  // R2 — queda de vendas (com diagnóstico tráfego × conversão)
  if (
    enoughHistory &&
    c.ordersPrev >= s.minOrdersHistory &&
    ordersChange !== null &&
    ordersChange <= -s.significantChangePct
  ) {
    const trafficFell = visitsChange !== null && visitsChange <= -s.significantChangePct
    const evidence: Evidence[] = [
      {
        label: 'FATO',
        text: `Pedidos: ${formatInt(c.ordersCur)} nos últimos ${w} dias vs ${formatInt(c.ordersPrev)} no período anterior (${formatPct(ordersChange, true)}).`,
      },
      { label: 'FATO', text: `Faturamento: ${formatBRL(c.revenueCur)} vs ${formatBRL(c.revenuePrev)}.` },
    ]
    if (visitsChange !== null) {
      evidence.push({ label: 'FATO', text: `Visitas: ${formatPct(visitsChange, true)} no mesmo período.` })
      evidence.push(
        trafficFell
          ? { label: 'INTERPRETAÇÃO', text: 'A queda acompanha a perda de tráfego — o problema é exposição, não conversão.' }
          : { label: 'INTERPRETAÇÃO', text: 'Tráfego estável com menos pedidos — a conversão piorou.' },
      )
      evidence.push(
        trafficFell
          ? { label: 'HIPÓTESE', text: 'Perda de posição na busca, redução de Ads ou fim de promoção.' }
          : { label: 'HIPÓTESE', text: 'Concorrente com preço menor, mudança no frete ou avaliação negativa recente.' },
      )
    } else {
      evidence.push({ label: 'INTERPRETAÇÃO', text: 'Sem dados de tráfego: não é possível separar exposição de conversão.' })
    }
    signals.push({
      ...base,
      fingerprint: `R2:${c.productChannelId}`,
      ruleCode: 'R2_SALES_DROP',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence: visitsChange === null ? 'low' : confidence,
      score: score('attention', c.revenuePrev - c.revenueCur),
      title: label(c),
      issue: `Pedidos caíram ${formatPct(Math.abs(ordersChange))} em ${w} dias.`,
      evidence,
      recommendation: trafficFell
        ? 'Investigar exposição (posição, Ads, promoções) antes de mexer em preço.'
        : 'Comparar preço e frete com concorrentes diretos e revisar avaliações recentes.',
      reason: trafficFell
        ? 'Conversão não é o gargalo; alterar preço não recupera tráfego.'
        : 'Com tráfego estável, a decisão do comprador mudou dentro do anúncio.',
      objective: 'Recuperar o volume de pedidos do período anterior.',
      suggestsChange: false,
      alert: { type: 'sales_drop', severity: 'attention', message: `${label(c)}: pedidos ${formatPct(ordersChange, true)} em ${w} dias.` },
    })
  }

  // R3 — muito tráfego, baixa conversão
  if (c.visitsCur !== null && c.visitsCur >= s.highTrafficVisits && conversion !== null && conversion < s.lowConversionPct) {
    signals.push({
      ...base,
      fingerprint: `R3:${c.productChannelId}`,
      ruleCode: 'R3_LOW_CONVERSION',
      kind: 'priority',
      severity: 'attention',
      actionType: 'approval_required',
      confidence,
      score: score('attention', c.revenueCur + 5000),
      title: label(c),
      issue: `Muito tráfego e conversão de ${formatPct(conversion)}.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.visitsCur)} visitas e ${formatInt(c.ordersCur)} pedidos em ${w} dias.` },
        { label: 'FATO', text: `Conversão abaixo do mínimo configurado (${formatPct(s.lowConversionPct)}).` },
        { label: 'INTERPRETAÇÃO', text: 'O anúncio atrai, mas não convence — o gargalo está dentro da página.' },
        { label: 'HIPÓTESE', text: 'Preço acima da concorrência, título/imagens fracos ou frete desfavorável.' },
      ],
      recommendation: 'Abrir um teste isolando uma variável (preço, título ou imagens).',
      reason: 'Uma variável por vez permite atribuir o resultado com segurança.',
      objective: `Elevar a conversão para pelo menos ${formatPct(s.healthyConversionPct)}.`,
      suggestsChange: true,
      alert: { type: 'conversion_drop', severity: 'attention', message: `${label(c)}: conversão de ${formatPct(conversion)} com ${formatInt(c.visitsCur)} visitas.` },
    })
  }

  // R3b — conversão saudável, tráfego caiu
  if (
    c.visitsCur !== null &&
    c.visitsCur >= s.minVisitsForConversion &&
    conversion !== null &&
    conversion >= s.healthyConversionPct &&
    visitsChange !== null &&
    visitsChange <= -s.significantChangePct
  ) {
    signals.push({
      ...base,
      fingerprint: `R3B:${c.productChannelId}`,
      ruleCode: 'R3B_TRAFFIC_DROP',
      kind: 'priority',
      severity: 'attention',
      actionType: 'recommendation',
      confidence,
      score: score('attention', c.revenuePrev),
      title: label(c),
      issue: `Tráfego caiu ${formatPct(Math.abs(visitsChange))} com conversão saudável.`,
      evidence: [
        { label: 'FATO', text: `Visitas: ${formatInt(c.visitsCur)} vs ${formatInt(c.visitsPrev)} (${formatPct(visitsChange, true)}).` },
        { label: 'FATO', text: `Conversão atual de ${formatPct(conversion)}.` },
        { label: 'INTERPRETAÇÃO', text: 'O anúncio continua convencendo; o problema é chegar menos gente.' },
        { label: 'HIPÓTESE', text: 'Perda de posição orgânica, orçamento de Ads esgotado ou sazonalidade.' },
      ],
      recommendation: 'Revisar exposição e Ads. Não alterar preço.',
      reason: 'Reduzir preço com conversão saudável sacrifica margem sem atacar a causa.',
      objective: 'Recuperar o tráfego do período anterior.',
      suggestsChange: false,
      alert: { type: 'traffic_drop', severity: 'attention', message: `${label(c)}: visitas ${formatPct(visitsChange, true)} em ${w} dias.` },
    })
  }

  // R4 — margem abaixo do mínimo
  if (c.pricing.status === 'ok' && c.pricing.marginPct < s.minMarginPct) {
    const p = c.pricing
    const severity: Severity = p.contributionMargin < 0 ? 'critical' : 'attention'
    signals.push({
      ...base,
      fingerprint: `R4:${c.productChannelId}`,
      ruleCode: 'R4_LOW_MARGIN',
      kind: 'priority',
      severity,
      actionType: 'approval_required',
      confidence: 'high',
      score: score(severity, c.revenueCur),
      title: label(c),
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
      recommendation: p.targetMarginPrice
        ? `Avaliar reajuste para ${formatBRL(p.targetMarginPrice)} ou redução de Ads/custo.`
        : 'Revisar custo, Ads e regras de taxa deste canal.',
      reason: 'Cada venda abaixo da margem mínima consome caixa.',
      objective: `Voltar para margem de pelo menos ${formatPct(s.minMarginPct)}.`,
      suggestsChange: true,
      alert: { type: 'low_margin', severity, message: `${label(c)}: margem de ${formatPct(p.marginPct)}.` },
    })
  }

  // R5 — aceleração de vendas
  if (
    enoughHistory &&
    c.ordersCur >= s.minOrdersHistory &&
    ordersChange !== null &&
    ordersChange >= s.significantChangePct
  ) {
    const marginOk = c.pricing.status === 'ok' && c.pricing.marginPct >= s.minMarginPct
    signals.push({
      ...base,
      fingerprint: `R5:${c.productChannelId}`,
      ruleCode: 'R5_ACCELERATION',
      kind: 'opportunity',
      severity: 'positive',
      actionType: 'recommendation',
      confidence,
      score: score('positive', c.revenueCur),
      title: label(c),
      issue: `Pedidos subiram ${formatPct(ordersChange)} em ${w} dias.`,
      evidence: [
        { label: 'FATO', text: `${formatInt(c.ordersCur)} pedidos vs ${formatInt(c.ordersPrev)} no período anterior.` },
        { label: 'FATO', text: `Faturamento de ${formatBRL(c.revenueCur)} na janela.` },
        ...(c.pricing.status === 'ok'
          ? [{ label: 'FATO' as const, text: `Margem atual de ${formatPct(c.pricing.marginPct)}.` }]
          : []),
        { label: 'INTERPRETAÇÃO', text: 'Produto ganhando tração — momento de proteger e ampliar, não de mexer.' },
      ],
      recommendation: marginOk
        ? 'Garantir estoque, manter preço e considerar reforço de Ads.'
        : 'Garantir estoque e revisar margem antes de investir em Ads.',
      reason: 'Alterar o anúncio durante a aceleração pode quebrar o que está funcionando.',
      objective: 'Sustentar o crescimento sem perder margem.',
      suggestsChange: false,
      alert: { type: 'acceleration', severity: 'positive', message: `${label(c)}: pedidos ${formatPct(ordersChange, true)} em ${w} dias.` },
    })
  }

  // R8 — dados obrigatórios ausentes para a análise de margem
  if (c.pricing.status !== 'ok') {
    signals.push({
      ...base,
      fingerprint: `R8:${c.productChannelId}:${c.pricing.status}`,
      ruleCode: 'R8_MISSING_DATA',
      kind: 'priority',
      severity: 'info',
      actionType: 'information',
      confidence: 'high',
      score: score('info', 0),
      title: label(c),
      issue: c.pricing.message,
      evidence: [{ label: 'FATO', text: c.pricing.message }],
      recommendation:
        c.pricing.status === 'missing_cost'
          ? 'Cadastrar o custo (lote) do produto.'
          : 'Cadastrar a regra de taxa vigente deste marketplace.',
      reason: 'Sem esses dados, margem e ponto de equilíbrio não podem ser calculados.',
      objective: 'Completar a base para análise de margem.',
      suggestsChange: false,
    })
  }

  return signals
}

/** R6 — testes em andamento: segura recomendações conflitantes (exceto críticas). */
export function applyExperimentGuard(signals: Signal[], experiments: ActiveExperiment[], today: string) {
  return signals.map((signal) => {
    if (!signal.suggestsChange || signal.severity === 'critical') return signal
    const exp = experiments.find(
      (e) =>
        e.status === 'in_progress' &&
        e.productId === signal.productId &&
        (e.productChannelId === null || e.productChannelId === signal.productChannelId),
    )
    if (!exp) return signal
    const remaining = Math.max(0, daysBetween(today, exp.evaluationDate))
    return {
      ...signal,
      kind: 'no_action' as const,
      severity: 'info' as const,
      actionType: 'information' as const,
      experimentId: exp.id,
      score: 30,
      evidence: [
        ...signal.evidence,
        { label: 'FATO' as const, text: `Teste #${String(exp.id).padStart(4, '0')} (${exp.variable}) em andamento até ${exp.evaluationDate}.` },
      ],
      recommendation: `Não alterar. Aguardar ${remaining} dia(s) até a avaliação do teste.`,
      reason: 'Mudar outra variável agora invalida a leitura do teste.',
      objective: 'Preservar a integridade do experimento.',
    }
  })
}

/** R7 — teste atingiu a data de avaliação. */
export function experimentReviewSignal(exp: ActiveExperiment, today: string): Signal | null {
  if (daysBetween(exp.evaluationDate, today) < 0) return null
  return {
    fingerprint: `R7:${exp.id}`,
    ruleCode: 'R7_TEST_REVIEW',
    kind: 'test_review',
    severity: 'attention',
    actionType: 'approval_required',
    confidence: 'medium',
    score: 85,
    productId: exp.productId,
    productChannelId: exp.productChannelId,
    marketplaceId: null,
    experimentId: exp.id,
    title: `Teste #${String(exp.id).padStart(4, '0')} pronto para revisão`,
    issue: `Data de avaliação (${exp.evaluationDate}) atingida.`,
    evidence: [
      { label: 'FATO', text: `Variável testada: ${exp.variable}. Início em ${exp.startDate}.` },
      { label: 'HIPÓTESE', text: exp.hypothesis },
    ],
    recommendation: 'Comparar antes × depois e decidir: manter, reverter, continuar ou novo teste.',
    reason: 'Testes sem decisão viram ruído e bloqueiam novas ações no produto.',
    objective: 'Registrar o aprendizado na memória estratégica.',
    suggestsChange: false,
    alert: { type: 'test_review', severity: 'attention', message: `Teste #${String(exp.id).padStart(4, '0')} atingiu a data de avaliação.` },
  }
}

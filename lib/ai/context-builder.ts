import 'server-only'
import { query, queryOne } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { isFreezeMemory } from '@/lib/engine/rules'
import type { ChannelHealth } from '@/lib/engine/run'
import { listAlerts, listExperiments, listMemory, listRecommendations } from '@/lib/queries'

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const NUM = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtBRL = (v: number) => `R$ ${NUM(2).format(v)}`
const fmtInt = (v: number) => NUM(0).format(v)
const fmtPct = (v: number) => `${NUM(2).format(v)}%`
const signed = (v: number, d: number, suffix: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${NUM(d).format(Math.abs(v))}${suffix}`

export type MetricKey = 'revenue' | 'orders' | 'units' | 'visits' | 'conversion' | 'average_ticket'
export const METRIC_KEYS: MetricKey[] = ['revenue', 'orders', 'units', 'visits', 'conversion', 'average_ticket']

export const METRIC_NAME: Record<MetricKey, string> = {
  revenue: 'Faturamento',
  orders: 'Pedidos',
  units: 'Unidades',
  visits: 'Visitas',
  conversion: 'Conversão',
  average_ticket: 'Ticket médio',
}
const METRIC_UNIT: Record<MetricKey, 'BRL' | 'count' | 'percent'> = {
  revenue: 'BRL',
  orders: 'count',
  units: 'count',
  visits: 'count',
  conversion: 'percent',
  average_ticket: 'BRL',
}

/** A metric as the model receives it: named, with both periods, the unit and every delta precomputed. */
export type Metric = {
  key: MetricKey
  name: string
  unit: 'BRL' | 'count' | 'percent'
  current: number | null
  previous: number | null
  change_absolute: number | null
  change_percent: number | null
  change_points: number | null
  period_current: string
  period_previous: string
  source: string
  comparable: boolean
  not_comparable_reason: string | null
  display: string
}

type Periods = { current: string; previous: string }

function formatValue(unit: Metric['unit'], v: number) {
  return unit === 'BRL' ? fmtBRL(v) : unit === 'percent' ? fmtPct(v) : fmtInt(v)
}

function buildMetric(
  key: MetricKey,
  current: number | null,
  previous: number | null,
  source: string,
  periods: Periods,
  notComparableReason: string | null = null,
): Metric {
  const unit = METRIC_UNIT[key]
  const name = METRIC_NAME[key]
  const comparable = notComparableReason === null && current !== null && previous !== null
  const cur = current === null ? null : round(current)
  const prev = previous === null ? null : round(previous)
  const changeAbsolute = comparable ? round(cur! - prev!) : null
  const changePercent = comparable && prev! > 0 ? round(((cur! - prev!) / prev!) * 100, 1) : null
  const changePoints = comparable && unit === 'percent' ? round(cur! - prev!) : null

  let display: string
  if (!comparable) {
    display = `${name}: ${notComparableReason ?? 'dados insuficientes para comparar os dois períodos'}.`
  } else {
    const delta =
      unit === 'percent'
        ? signed(changePoints!, 2, ' p.p.')
        : changePercent !== null
          ? signed(changePercent, 1, '%')
          : 'sem base anterior para variação'
    display = `${name}: ${formatValue(unit, prev!)} → ${formatValue(unit, cur!)} (${delta})`
  }

  return {
    key,
    name,
    unit,
    current: cur,
    previous: prev,
    change_absolute: changeAbsolute,
    change_percent: unit === 'percent' ? null : changePercent,
    change_points: changePoints,
    period_current: periods.current,
    period_previous: periods.previous,
    source,
    comparable,
    not_comparable_reason: comparable ? null : (notComparableReason ?? 'dados insuficientes'),
    display,
  }
}

/** Human-readable line for the UI, built from the same metric object the model receives. */
export function metricLine(m: Metric) {
  return {
    name: m.name,
    current: m.current === null ? '—' : formatValue(m.unit, m.current),
    previous: m.previous === null ? '—' : formatValue(m.unit, m.previous),
    delta: !m.comparable
      ? null
      : m.unit === 'percent'
        ? signed(m.change_points!, 2, ' p.p.')
        : m.change_percent !== null
          ? signed(m.change_percent, 1, '%')
          : null,
  }
}

type RawWindow = {
  orders_cur: number; orders_prev: number
  units_cur: number; units_prev: number
  revenue_cur: number; revenue_prev: number
  visits_cur: number | null; visits_prev: number | null
}

/** Every derived number (conversion, ticket, deltas) is computed here, before the model sees anything. */
function buildMetrics(r: RawWindow, source: string, periods: Periods, trafficIssue: string | null) {
  const conv = (orders: number, visits: number | null) => (visits && visits > 0 ? (orders / visits) * 100 : null)
  const tk = (revenue: number, orders: number) => (orders > 0 ? revenue / orders : null)
  const visitsIssue = trafficIssue ?? (r.visits_cur === null || r.visits_prev === null ? 'visitas não sincronizadas nos dois períodos' : null)
  return {
    revenue: buildMetric('revenue', r.revenue_cur, r.revenue_prev, source, periods),
    orders: buildMetric('orders', r.orders_cur, r.orders_prev, source, periods),
    units: buildMetric('units', r.units_cur, r.units_prev, source, periods),
    visits: buildMetric('visits', r.visits_cur, r.visits_prev, source, periods, visitsIssue),
    conversion: buildMetric('conversion', conv(r.orders_cur, r.visits_cur), conv(r.orders_prev, r.visits_prev), source, periods, visitsIssue),
    average_ticket: buildMetric(
      'average_ticket',
      tk(r.revenue_cur, r.orders_cur),
      tk(r.revenue_prev, r.orders_prev),
      source,
      periods,
      r.orders_cur === 0 || r.orders_prev === 0 ? 'sem pedidos em um dos períodos' : null,
    ),
  } satisfies Record<MetricKey, Metric>
}

export type MetricSet = ReturnType<typeof buildMetrics>

function shiftISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type WindowRow = {
  code: string
  name: string
  orders_cur: string; orders_prev: string
  units_cur: string; units_prev: string
  revenue_cur: string; revenue_prev: string
  visits_cur: string | null; visits_prev: string | null
  traffic_days_cur: string; traffic_days_prev: string
}

export type ChannelStatusLabel = 'SAUDÁVEL' | 'ATENÇÃO' | 'CRÍTICO' | 'DADOS INSUFICIENTES'
const STATUS_LABEL: Record<ChannelHealth['status'], ChannelStatusLabel> = {
  healthy: 'SAUDÁVEL',
  attention: 'ATENÇÃO',
  critical: 'CRÍTICO',
  insufficient_data: 'DADOS INSUFICIENTES',
}

export type PendingItem = { dado: string; impacto: string }

export async function buildDailyContext(opts: { windowDays?: number; analysisRunId?: number | null } = {}) {
  const days = opts.windowDays ?? 7
  const today = todayISO()
  const curStart = shiftISO(today, -(days - 1))
  const prevStart = shiftISO(today, -(2 * days - 1))
  const prevEnd = shiftISO(today, -days)
  const periods: Periods = {
    current: `${brDate(curStart)} → ${brDate(today)}`,
    previous: `${brDate(prevStart)} → ${brDate(prevEnd)}`,
  }

  const [channelRows, productRows, recs, experiments, memory, alerts, quality, trace, healthRow] = await Promise.all([
    query<WindowRow>(
      `WITH s AS (
         SELECT pc.marketplace_id,
                SUM(sm.orders)  FILTER (WHERE sm.metric_date >= $2::date) AS orders_cur,
                SUM(sm.orders)  FILTER (WHERE sm.metric_date <  $2::date) AS orders_prev,
                SUM(sm.units)   FILTER (WHERE sm.metric_date >= $2::date) AS units_cur,
                SUM(sm.units)   FILTER (WHERE sm.metric_date <  $2::date) AS units_prev,
                SUM(sm.revenue) FILTER (WHERE sm.metric_date >= $2::date) AS revenue_cur,
                SUM(sm.revenue) FILTER (WHERE sm.metric_date <  $2::date) AS revenue_prev
           FROM sales_metrics sm JOIN product_channels pc ON pc.id = sm.product_channel_id
          WHERE sm.metric_date BETWEEN $3::date AND $1::date
          GROUP BY pc.marketplace_id
       ), t AS (
         SELECT pc.marketplace_id,
                SUM(tm.visits) FILTER (WHERE tm.metric_date >= $2::date) AS visits_cur,
                SUM(tm.visits) FILTER (WHERE tm.metric_date <  $2::date) AS visits_prev,
                COUNT(DISTINCT tm.metric_date) FILTER (WHERE tm.metric_date >= $2::date) AS traffic_days_cur,
                COUNT(DISTINCT tm.metric_date) FILTER (WHERE tm.metric_date <  $2::date) AS traffic_days_prev
           FROM traffic_metrics tm JOIN product_channels pc ON pc.id = tm.product_channel_id
          WHERE tm.metric_date BETWEEN $3::date AND $1::date
          GROUP BY pc.marketplace_id
       )
       SELECT m.code, m.name,
              COALESCE(s.orders_cur,0) AS orders_cur, COALESCE(s.orders_prev,0) AS orders_prev,
              COALESCE(s.units_cur,0) AS units_cur, COALESCE(s.units_prev,0) AS units_prev,
              COALESCE(s.revenue_cur,0) AS revenue_cur, COALESCE(s.revenue_prev,0) AS revenue_prev,
              t.visits_cur, t.visits_prev,
              COALESCE(t.traffic_days_cur,0) AS traffic_days_cur, COALESCE(t.traffic_days_prev,0) AS traffic_days_prev
         FROM marketplaces m
         JOIN marketplace_connections mc ON mc.marketplace_id = m.id AND mc.status = 'connected'
    LEFT JOIN s ON s.marketplace_id = m.id
    LEFT JOIN t ON t.marketplace_id = m.id
        WHERE m.code <> 'upseller'`,
      [today, curStart, prevStart],
    ),
    query<{
      sku: string; produto: string; canal: string; preco: string | null
      orders_cur: string; orders_prev: string; units_cur: string; units_prev: string
      revenue_cur: string; revenue_prev: string; visits_cur: string | null; visits_prev: string | null
      has_cost: boolean
    }>(
      `WITH s AS (
         SELECT sm.product_channel_id,
                SUM(sm.orders)  FILTER (WHERE sm.metric_date >= $2::date) AS orders_cur,
                SUM(sm.orders)  FILTER (WHERE sm.metric_date <  $2::date) AS orders_prev,
                SUM(sm.units)   FILTER (WHERE sm.metric_date >= $2::date) AS units_cur,
                SUM(sm.units)   FILTER (WHERE sm.metric_date <  $2::date) AS units_prev,
                SUM(sm.revenue) FILTER (WHERE sm.metric_date >= $2::date) AS revenue_cur,
                SUM(sm.revenue) FILTER (WHERE sm.metric_date <  $2::date) AS revenue_prev
           FROM sales_metrics sm WHERE sm.metric_date BETWEEN $3::date AND $1::date
          GROUP BY sm.product_channel_id
       ), t AS (
         SELECT tm.product_channel_id,
                SUM(tm.visits) FILTER (WHERE tm.metric_date >= $2::date) AS visits_cur,
                SUM(tm.visits) FILTER (WHERE tm.metric_date <  $2::date) AS visits_prev
           FROM traffic_metrics tm WHERE tm.metric_date BETWEEN $3::date AND $1::date
          GROUP BY tm.product_channel_id
       )
       SELECT p.sku, p.name AS produto, m.name AS canal, pc.current_price AS preco,
              COALESCE(s.orders_cur,0) AS orders_cur, COALESCE(s.orders_prev,0) AS orders_prev,
              COALESCE(s.units_cur,0) AS units_cur, COALESCE(s.units_prev,0) AS units_prev,
              COALESCE(s.revenue_cur,0) AS revenue_cur, COALESCE(s.revenue_prev,0) AS revenue_prev,
              t.visits_cur, t.visits_prev,
              EXISTS (SELECT 1 FROM product_costs c WHERE c.product_id = p.id AND c.average_cost > 0) AS has_cost
         FROM product_channels pc
         JOIN products p ON p.id = pc.product_id
         JOIN marketplaces m ON m.id = pc.marketplace_id
         JOIN s ON s.product_channel_id = pc.id
    LEFT JOIN t ON t.product_channel_id = pc.id
        WHERE COALESCE(s.revenue_cur,0) + COALESCE(s.revenue_prev,0) > 0
        ORDER BY GREATEST(COALESCE(s.revenue_cur,0), COALESCE(s.revenue_prev,0)) DESC
        LIMIT 15`,
      [today, curStart, prevStart],
    ),
    listRecommendations({ kinds: ['priority', 'opportunity', 'test_review'], statuses: ['open'], limit: 12 }),
    listExperiments({ statuses: ['in_progress', 'ready_for_review'] }),
    listMemory({ status: 'active', limit: 30 }),
    listAlerts(['open'], 10),
    queryOne<{ fee_rules: string; products_selling_without_cost: string; last_sync: string | null }>(
      `SELECT (SELECT COUNT(*) FROM fee_rules WHERE active) AS fee_rules,
              (SELECT COUNT(DISTINCT pc.product_id) FROM sales_metrics sm JOIN product_channels pc ON pc.id = sm.product_channel_id
                WHERE sm.metric_date >= $1::date AND sm.orders > 0
                  AND NOT EXISTS (SELECT 1 FROM product_costs c WHERE c.product_id = pc.product_id AND c.average_cost > 0)) AS products_selling_without_cost,
              (SELECT MAX(synced_at)::text FROM sales_metrics) AS last_sync`,
      [prevStart],
    ).catch(() => null),
    opts.analysisRunId
      ? queryOne<{ new_value: Record<string, unknown> | null }>(
          `SELECT new_value FROM audit_logs WHERE action = 'engine.run' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [String(opts.analysisRunId)],
        ).catch(() => null)
      : Promise.resolve(null),
    queryOne<{ health: ChannelHealth[] | null }>(
      opts.analysisRunId
        ? `SELECT health FROM analysis_runs WHERE id = $1`
        : `SELECT health FROM analysis_runs WHERE status = 'success' ORDER BY started_at DESC LIMIT 1`,
      opts.analysisRunId ? [opts.analysisRunId] : [],
    ).catch(() => null),
  ])

  const n = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v))
  const channels = channelRows.map((r) => {
    const trafficDaysCur = Number(r.traffic_days_cur)
    const trafficDaysPrev = Number(r.traffic_days_prev)
    const trafficIssue =
      trafficDaysCur >= days && trafficDaysPrev >= days
        ? null
        : `visitas incompletas (${trafficDaysCur} de ${days} dias no período atual, ${trafficDaysPrev} de ${days} no anterior)`
    return {
      canal: r.name,
      codigo: r.code,
      metrics: buildMetrics(
        {
          orders_cur: Number(r.orders_cur), orders_prev: Number(r.orders_prev),
          units_cur: Number(r.units_cur), units_prev: Number(r.units_prev),
          revenue_cur: Number(r.revenue_cur), revenue_prev: Number(r.revenue_prev),
          visits_cur: n(r.visits_cur), visits_prev: n(r.visits_prev),
        },
        r.name,
        periods,
        trafficIssue,
      ),
      visitas_completas: trafficIssue === null,
    }
  })

  const products = productRows.map((r) => ({
    sku: r.sku,
    produto: r.produto,
    canal: r.canal,
    preco_atual: n(r.preco),
    custo_cadastrado: r.has_cost,
    metrics: buildMetrics(
      {
        orders_cur: Number(r.orders_cur), orders_prev: Number(r.orders_prev),
        units_cur: Number(r.units_cur), units_prev: Number(r.units_prev),
        revenue_cur: Number(r.revenue_cur), revenue_prev: Number(r.revenue_prev),
        visits_cur: n(r.visits_cur), visits_prev: n(r.visits_prev),
      },
      r.canal,
      periods,
      null,
    ),
  }))

  const health = healthRow?.health ?? []
  const channelStatus = health
    .filter((h) => h.channels > 0 || h.connection === 'connected')
    .map((h) => ({ canal: h.name, status: STATUS_LABEL[h.status], motivo: h.reason }))

  const pending: PendingItem[] = []
  if (!channels.length) pending.push({ dado: 'Nenhum canal conectado com dados.', impacto: 'Não é possível analisar vendas.' })
  for (const c of channels) {
    if (!c.visitas_completas) {
      pending.push({
        dado: `${c.canal}: ${c.metrics.visits.not_comparable_reason}.`,
        impacto: 'Visitas e conversão deste canal não podem ser comparadas com segurança.',
      })
    }
    if (c.metrics.orders.current === 0 && c.metrics.orders.previous === 0) {
      pending.push({ dado: `${c.canal}: nenhum pedido nos dois períodos.`, impacto: 'Não há vendas para comparar neste canal.' })
    }
  }
  if (quality && Number(quality.fee_rules) === 0) {
    pending.push({ dado: 'Nenhuma regra de taxa ativa.', impacto: 'A margem não pode ser calculada em nenhum produto.' })
  }
  const withoutCost = quality ? Number(quality.products_selling_without_cost) : 0
  if (withoutCost > 0) {
    pending.push({
      dado: `${withoutCost} produto(s) vendendo sem custo cadastrado.`,
      impacto: 'A margem desses produtos não pode ser calculada. Isso não indica margem ruim.',
    })
  }
  pending.push({
    dado: 'Ads, promoções e concorrência não estão sincronizados.',
    impacto: 'Nenhuma conclusão sobre esses fatores pode ser tirada desta análise.',
  })

  const context = {
    operation: 'DAILY_ANALYSIS',
    today,
    period: { start: curStart, end: today, days, label: periods.current },
    comparisonPeriod: { start: prevStart, end: prevEnd, days, label: periods.previous },
    CHANNEL_STATUS: channelStatus,
    FACTS: { channels, products },
    DETERMINISTIC_FINDINGS: recs.map((r) => ({
      id: `rec:${r.id}`,
      tipo: r.kind,
      regra: r.rule_code,
      severidade: r.severity,
      confianca: r.confidence,
      sku: r.sku,
      titulo: r.title,
      problema: r.issue,
      recomendacao: r.recommendation,
      motivo: r.reason,
      periodo_atual: periods.current,
      periodo_anterior: periods.previous,
      evidencias: (r.evidence_data ?? []).slice(0, 8),
    })),
    ACTIVE_TESTS: experiments.map((e) => ({
      id: Number(e.id),
      sku: e.sku,
      produto: e.product_name,
      canal: e.marketplace_name,
      variavel: e.variable,
      de: e.previous_value,
      para: e.new_value,
      hipotese: e.hypothesis,
      inicio: e.start_date,
      avaliacao: e.evaluation_date,
      metrica_principal: e.primary_metric,
      status: e.status,
    })),
    MEMORY: memory.map((m) => ({
      origem: 'memória histórica — não é métrica do período atual',
      data: m.memory_date,
      tipo: m.kind,
      assunto: m.subject,
      decisao: m.decision,
      motivo: m.reason,
      produto: m.product_name,
      congela_alteracoes: isFreezeMemory({ id: 0, productId: 0, kind: m.kind, subject: m.subject ?? '', decision: m.decision ?? '' }),
    })),
    ALERTS: alerts.map((a) => ({ id: `alerta:${a.id}`, tipo: a.alert_type, severidade: a.severity, mensagem: a.message })),
    KNOWN_SKUS: [
      ...new Set(
        [...products.map((p) => p.sku), ...recs.map((r) => r.sku), ...experiments.map((e) => e.sku)].filter(
          (s): s is string => typeof s === 'string' && s.length > 0,
        ),
      ),
    ],
    UNKNOWN: pending,
    dataQuality: {
      ultima_sincronizacao: quality?.last_sync ?? null,
      regras_de_taxa_ativas: quality ? Number(quality.fee_rules) : null,
      produtos_vendendo_sem_custo: quality ? withoutCost : null,
    },
    engineTrace: (() => {
      const t = (trace?.new_value as { trace?: Record<string, unknown> } | null)?.trace
      if (!t) return null
      const { settings: _settings, ...rest } = t
      return rest
    })(),
  }

  const summary = {
    channels: channels.length,
    products: products.length,
    findings: context.DETERMINISTIC_FINDINGS.length,
    tests: context.ACTIVE_TESTS.length,
    memory: context.MEMORY.length,
    unknown: pending.length,
    period: `${curStart}..${today} vs ${prevStart}..${prevEnd}`,
  }

  return { context, summary }
}

export type DailyContext = Awaited<ReturnType<typeof buildDailyContext>>['context']

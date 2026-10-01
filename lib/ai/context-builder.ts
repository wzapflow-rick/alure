import 'server-only'
import { query, queryOne } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { listAlerts, listExperiments, listMemory, listRecommendations } from '@/lib/queries'

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
const pctChange = (cur: number, prev: number) => (prev > 0 ? round(((cur - prev) / prev) * 100, 1) : null)
const ratioPct = (num: number, den: number) => (den > 0 ? round((num / den) * 100, 2) : null)
const ticket = (revenue: number, orders: number) => (orders > 0 ? round(revenue / orders) : null)

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

/** Every derived number (conversion, ticket, deltas) is computed here, before the model sees anything. */
function shapeWindow(r: { orders_cur: number; orders_prev: number; revenue_cur: number; revenue_prev: number; units_cur: number; units_prev: number; visits_cur: number | null; visits_prev: number | null }) {
  return {
    atual: {
      pedidos: r.orders_cur,
      unidades: r.units_cur,
      faturamento: round(r.revenue_cur),
      ticket_medio: ticket(r.revenue_cur, r.orders_cur),
      visitas: r.visits_cur,
      conversao_pct: r.visits_cur ? ratioPct(r.orders_cur, r.visits_cur) : null,
    },
    anterior: {
      pedidos: r.orders_prev,
      unidades: r.units_prev,
      faturamento: round(r.revenue_prev),
      ticket_medio: ticket(r.revenue_prev, r.orders_prev),
      visitas: r.visits_prev,
      conversao_pct: r.visits_prev ? ratioPct(r.orders_prev, r.visits_prev) : null,
    },
    variacao_pct: {
      pedidos: pctChange(r.orders_cur, r.orders_prev),
      faturamento: pctChange(r.revenue_cur, r.revenue_prev),
      ticket_medio: (() => {
        const a = ticket(r.revenue_cur, r.orders_cur)
        const b = ticket(r.revenue_prev, r.orders_prev)
        return a !== null && b !== null ? pctChange(a, b) : null
      })(),
      visitas: r.visits_cur !== null && r.visits_prev ? pctChange(r.visits_cur, r.visits_prev) : null,
    },
  }
}

export async function buildDailyContext(opts: { windowDays?: number; analysisRunId?: number | null } = {}) {
  const days = opts.windowDays ?? 7
  const today = todayISO()
  const curStart = shiftISO(today, -(days - 1))
  const prevStart = shiftISO(today, -(2 * days - 1))
  const prevEnd = shiftISO(today, -days)

  const [channelRows, productRows, recs, experiments, memory, alerts, quality, trace] = await Promise.all([
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
    queryOne<{ fee_rules: string; products_selling_without_cost: string; last_sync: string | null; last_sync_status: string | null }>(
      `SELECT (SELECT COUNT(*) FROM fee_rules WHERE active) AS fee_rules,
              (SELECT COUNT(DISTINCT pc.product_id) FROM sales_metrics sm JOIN product_channels pc ON pc.id = sm.product_channel_id
                WHERE sm.metric_date >= $1::date AND sm.orders > 0
                  AND NOT EXISTS (SELECT 1 FROM product_costs c WHERE c.product_id = pc.product_id AND c.average_cost > 0)) AS products_selling_without_cost,
              (SELECT MAX(synced_at)::text FROM sales_metrics) AS last_sync,
              NULL::text AS last_sync_status`,
      [prevStart],
    ).catch(() => null),
    opts.analysisRunId
      ? queryOne<{ new_value: Record<string, unknown> | null }>(
          `SELECT new_value FROM audit_logs WHERE action = 'engine.run' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [String(opts.analysisRunId)],
        ).catch(() => null)
      : Promise.resolve(null),
  ])

  const n = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v))
  const channels = channelRows.map((r) => {
    const trafficComplete = Number(r.traffic_days_cur) >= days && Number(r.traffic_days_prev) >= days
    return {
      canal: r.name,
      codigo: r.code,
      ...shapeWindow({
        orders_cur: Number(r.orders_cur), orders_prev: Number(r.orders_prev),
        units_cur: Number(r.units_cur), units_prev: Number(r.units_prev),
        revenue_cur: Number(r.revenue_cur), revenue_prev: Number(r.revenue_prev),
        visits_cur: n(r.visits_cur), visits_prev: n(r.visits_prev),
      }),
      dias_com_visitas: { atual: Number(r.traffic_days_cur), anterior: Number(r.traffic_days_prev), completo: trafficComplete },
    }
  })

  const products = productRows.map((r) => ({
    sku: r.sku,
    produto: r.produto,
    canal: r.canal,
    preco_atual: n(r.preco),
    custo_cadastrado: r.has_cost,
    ...shapeWindow({
      orders_cur: Number(r.orders_cur), orders_prev: Number(r.orders_prev),
      units_cur: Number(r.units_cur), units_prev: Number(r.units_prev),
      revenue_cur: Number(r.revenue_cur), revenue_prev: Number(r.revenue_prev),
      visits_cur: n(r.visits_cur), visits_prev: n(r.visits_prev),
    }),
  }))

  const unknown: string[] = []
  if (!channels.length) unknown.push('Nenhum canal conectado com dados.')
  for (const c of channels) {
    if (!c.dias_com_visitas.completo) unknown.push(`${c.canal}: visitas incompletas no período (${c.dias_com_visitas.atual}/${days} dias atuais, ${c.dias_com_visitas.anterior}/${days} anteriores) — conversão não confiável.`)
    if (c.atual.pedidos + c.anterior.pedidos === 0) unknown.push(`${c.canal}: nenhum pedido nos dois períodos.`)
  }
  if (quality && Number(quality.fee_rules) === 0) unknown.push('Nenhuma regra de taxa ativa — margem não calculável.')
  if (quality && Number(quality.products_selling_without_cost) > 0) unknown.push(`${quality.products_selling_without_cost} produto(s) vendendo sem custo cadastrado — margem desses produtos desconhecida.`)
  unknown.push('Ads, promoções e concorrência: sem dados sincronizados neste contexto.')

  const context = {
    operation: 'DAILY_ANALYSIS',
    today,
    period: { start: curStart, end: today, days },
    comparisonPeriod: { start: prevStart, end: prevEnd, days },
    FACTS: { channels, products },
    DETERMINISTIC_FINDINGS: recs.map((r) => ({
      tipo: r.kind,
      regra: r.rule_code,
      severidade: r.severity,
      confianca: r.confidence,
      sku: r.sku,
      titulo: r.title,
      problema: r.issue,
      recomendacao: r.recommendation,
      motivo: r.reason,
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
      data: m.memory_date,
      tipo: m.kind,
      assunto: m.subject,
      decisao: m.decision,
      motivo: m.reason,
      produto: m.product_name,
    })),
    ALERTS: alerts.map((a) => ({ severidade: a.severity, mensagem: a.message })),
    UNKNOWN: unknown,
    dataQuality: {
      ultima_sincronizacao: quality?.last_sync ?? null,
      status_ultima_sincronizacao: quality?.last_sync_status ?? null,
      regras_de_taxa_ativas: quality ? Number(quality.fee_rules) : null,
      produtos_vendendo_sem_custo: quality ? Number(quality.products_selling_without_cost) : null,
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
    unknown: unknown.length,
    period: `${curStart}..${today} vs ${prevStart}..${prevEnd}`,
  }

  return { context, summary }
}

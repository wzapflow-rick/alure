import 'server-only'
import type { PoolClient } from 'pg'
import { query, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { daysBetween, todayISO, toNumber } from '@/lib/format'
import { getActiveFeeRules, priceChannel } from '@/lib/pricing/service'
import { getEngineSettings, type EngineSettings } from '@/lib/settings'
import type { SessionUser } from '@/lib/session'
import {
  applyExperimentGuard,
  applyMotorCascade,
  type CompetitorOffer,
  consolidateLostPace,
  baselineFor,
  CATEGORY_LABEL,
  evaluateChannel,
  experimentReviewSignal,
  isFreezeMemory,
  ruleMeta,
  type ActiveExperiment,
  type StrategicMemory,
  type ChannelStats,
  COMPETITIVE_INTELLIGENCE_ACTIVE,
  type Classification,
  type Competition,
  type Signal,
} from '@/lib/engine/rules'

type ChannelRow = {
  product_channel_id: string
  product_id: string
  marketplace_id: string
  marketplace_name: string
  product_name: string
  sku: string
  category: string | null
  classification: Classification
  current_price: string
  ads_cost_pct: string
  seller_discount: string
  average_cost: string | null
  window_days: number
  base_len: number
  first_date: string | null
  orders_cur: string
  orders_prev: string
  units_cur: string
  available_quantity: number | null
  revenue_cur: string
  revenue_prev: string
  orders_base: string
  revenue_base: string
  last_sale_date: string | null
  sale_days_90: string
  first_traffic_date: string | null
  visits_cur: string | null
  visits_prev: string | null
  visits_base: string | null
  price_change_date: string | null
  price_change_previous: string | null
  price_change_price: string | null
  units_7: string
  units_14: string
  units_28: string
  revenue_14: string
  revenue_28: string
  sale_days_14: string
  sale_days_28: string
  units_2: string
  units_d2: string
  units_prior7: string
  visits_2: string | null
  visits_prior7: string | null
}

type CompetitionRow = {
  product_channel_id: string
  competitor_name: string
  price: string
  free_shipping: boolean | null
  is_full: boolean | null
  sold_quantity: number | null
  source: string
  observed_on: string
  previous_price: string | null
}

const severityRank = (s: string) => (s === 'critical' ? 3 : s === 'attention' ? 2 : 1)
const SEVERITY_RANK_SQL = (col: string) => `(CASE ${col} WHEN 'critical' THEN 3 WHEN 'attention' THEN 2 ELSE 1 END)`

/** Alert history comes from migration 007; before it runs, events are simply not recorded. */
export async function hasAlertHistory() {
  const rows = await query<{ ok: boolean }>(`SELECT to_regclass('public.alert_events') IS NOT NULL AS ok`)
  return Boolean(rows[0]?.ok)
}

/** Competitor observations come from migration 007; before it runs, competition is unknown. */
async function loadCompetition(today: string, freshDays: number): Promise<Map<number, Competition>> {
  const exists = await query<{ ok: boolean; extra: boolean }>(
    `SELECT to_regclass('public.competitor_offers') IS NOT NULL AS ok,
            EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'competitor_offers' AND column_name = 'is_full') AS extra`,
  )
  if (!exists[0]?.ok) return new Map()
  // Migration 008 adds Full / seller sales; before it, those signals are unknown.
  const extra = exists[0].extra ? 'is_full, sold_quantity' : 'NULL::boolean AS is_full, NULL::int AS sold_quantity'
  const rows = await query<CompetitionRow>(
    `WITH ranked AS (
       SELECT product_channel_id, competitor_name, price, free_shipping, ${extra}, source, observed_on,
              ROW_NUMBER() OVER w AS rn,
              LEAD(price) OVER w AS previous_price
         FROM competitor_offers
        WHERE observed_on <= $1::date
       WINDOW w AS (PARTITION BY product_channel_id, lower(competitor_name) ORDER BY observed_on DESC, id DESC)
     )
     SELECT product_channel_id, competitor_name, price, free_shipping, is_full, sold_quantity, source,
            to_char(observed_on,'YYYY-MM-DD') AS observed_on, previous_price
       FROM ranked
      WHERE rn = 1 AND observed_on > $1::date - $2::int
      ORDER BY product_channel_id, price ASC`,
    [today, freshDays],
  )
  const byChannel = new Map<number, CompetitorOffer[]>()
  for (const r of rows) {
    const id = Number(r.product_channel_id)
    const list = byChannel.get(id) ?? []
    list.push({
      name: r.competitor_name,
      price: Number(r.price),
      freeShipping: r.free_shipping,
      isFull: r.is_full,
      soldQuantity: r.sold_quantity === null ? null : Number(r.sold_quantity),
      source: r.source,
      observedOn: r.observed_on,
      previousPrice: toNumber(r.previous_price),
    })
    byChannel.set(id, list)
  }
  return new Map(
    [...byChannel].map(([id, all]) => [id, { offers: all.length, cheapest: all[0], all }]),
  )
}

/** Days of [start, end] covered by data that begins at firstDate. */
function coverage(firstDate: string | null, startOffset: number, length: number, today: string) {
  if (!firstDate) return 0
  const sinceFirst = daysBetween(firstDate, today) + 1
  return Math.max(0, Math.min(length, sinceFirst - startOffset))
}

/** Stock comes from migration 005; before it runs, the engine treats stock as unknown. */
async function hasStockColumn() {
  const rows = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'product_channels' AND column_name = 'available_quantity') AS ok`,
  )
  return Boolean(rows[0]?.ok)
}

export async function loadChannelStats(
  today: string,
  windowDays: number,
  targetMarginPct: number,
  competitorFreshDays = 14,
  minMarginPct?: number,
) {
  const stockSelect = (await hasStockColumn()) ? 'pc.available_quantity' : 'NULL::int AS available_quantity'
  const rows = await query<ChannelRow>(
    `SELECT pc.id AS product_channel_id, pc.product_id, pc.marketplace_id, m.name AS marketplace_name,
            p.name AS product_name, p.sku, p.category, p.classification,
            pc.current_price, pc.ads_cost_pct, pc.seller_discount, pcs.average_cost,
            win.w AS window_days, win.base_len,
            to_char(COALESCE(cov.first_date, s.first_date),'YYYY-MM-DD') AS first_date,
            COALESCE(s.orders_cur,0) AS orders_cur, COALESCE(s.orders_prev,0) AS orders_prev,
            COALESCE(s.units_cur,0) AS units_cur, ${stockSelect},
            COALESCE(s.revenue_cur,0) AS revenue_cur, COALESCE(s.revenue_prev,0) AS revenue_prev,
            COALESCE(s.orders_base,0) AS orders_base, COALESCE(s.revenue_base,0) AS revenue_base,
            to_char(s.last_sale_date,'YYYY-MM-DD') AS last_sale_date,
            COALESCE(s.sale_days_90,0) AS sale_days_90,
            COALESCE(s.units_7,0) AS units_7, COALESCE(s.units_14,0) AS units_14, COALESCE(s.units_28,0) AS units_28,
            COALESCE(s.revenue_14,0) AS revenue_14, COALESCE(s.revenue_28,0) AS revenue_28,
            COALESCE(s.sale_days_14,0) AS sale_days_14, COALESCE(s.sale_days_28,0) AS sale_days_28,
            COALESCE(s.units_2,0) AS units_2, COALESCE(s.units_d2,0) AS units_d2, COALESCE(s.units_prior7,0) AS units_prior7,
            to_char(t.first_date,'YYYY-MM-DD') AS first_traffic_date,
            t.visits_cur, t.visits_prev, t.visits_base, t.visits_2, t.visits_prior7,
            to_char(ph.changed_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS price_change_date,
            ph.previous_price AS price_change_previous, ph.price AS price_change_price
       FROM product_channels pc
       JOIN products p ON p.id = pc.product_id
       JOIN marketplaces m ON m.id = pc.marketplace_id
  LEFT JOIN product_costs pcs ON pcs.product_id = p.id AND pcs.active
 CROSS JOIN LATERAL (
        SELECT w, GREATEST(30, w * 4) AS base_len
          FROM (SELECT CASE WHEN p.classification IN ('alto_ticket','sazonal') THEN $2::int * 3 ELSE $2::int END AS w) x
       ) win
  LEFT JOIN LATERAL (
        SELECT MIN(metric_date) AS first_date,
               SUM(orders)  FILTER (WHERE metric_date >  $1::date - win.w)                                         AS orders_cur,
               SUM(orders)  FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - 2*win.w)    AS orders_prev,
               SUM(units)   FILTER (WHERE metric_date >  $1::date - win.w)                                         AS units_cur,
               SUM(revenue) FILTER (WHERE metric_date >  $1::date - win.w)                                         AS revenue_cur,
               SUM(revenue) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - 2*win.w)    AS revenue_prev,
               SUM(orders)  FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - win.w - win.base_len) AS orders_base,
               SUM(revenue) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - win.w - win.base_len) AS revenue_base,
               MAX(metric_date) FILTER (WHERE orders > 0)                                                          AS last_sale_date,
               COUNT(*) FILTER (WHERE orders > 0 AND metric_date > $1::date - 90)                                  AS sale_days_90,
               SUM(COALESCE(NULLIF(units,0), orders)) FILTER (WHERE metric_date > $1::date - 7)                    AS units_7,
               SUM(COALESCE(NULLIF(units,0), orders)) FILTER (WHERE metric_date > $1::date - 14)                   AS units_14,
               SUM(COALESCE(NULLIF(units,0), orders)) FILTER (WHERE metric_date > $1::date - 28)                   AS units_28,
               SUM(revenue) FILTER (WHERE metric_date > $1::date - 14)                                             AS revenue_14,
               SUM(revenue) FILTER (WHERE metric_date > $1::date - 28)                                             AS revenue_28,
               COUNT(*) FILTER (WHERE orders > 0 AND metric_date > $1::date - 14)                                  AS sale_days_14,
               COUNT(*) FILTER (WHERE orders > 0 AND metric_date > $1::date - 28)                                  AS sale_days_28,
               SUM(COALESCE(NULLIF(units,0), orders)) FILTER (WHERE metric_date > $1::date - 2)                    AS units_2,
               SUM(COALESCE(NULLIF(units,0), orders)) FILTER (WHERE metric_date = $1::date - 2)                    AS units_d2,
               SUM(COALESCE(NULLIF(units,0), orders)) FILTER (WHERE metric_date <= $1::date - 2 AND metric_date > $1::date - 9) AS units_prior7
          FROM sales_metrics
         WHERE product_channel_id = pc.id AND metric_date <= $1::date
       ) s ON true
  -- History is what the marketplace sync covers, not the listing's first sale: a listing that
  -- never sold inside synced history has zero sales, not missing data.
  LEFT JOIN LATERAL (
        SELECT MIN(sm.metric_date) AS first_date
          FROM sales_metrics sm JOIN product_channels pc2 ON pc2.id = sm.product_channel_id
         WHERE pc2.marketplace_id = pc.marketplace_id AND sm.metric_date <= $1::date
       ) cov ON true
  LEFT JOIN LATERAL (
        SELECT MIN(metric_date) AS first_date,
               SUM(visits) FILTER (WHERE metric_date >  $1::date - win.w)                                      AS visits_cur,
               SUM(visits) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - 2*win.w) AS visits_prev,
               SUM(visits) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - win.w - win.base_len) AS visits_base,
               SUM(visits) FILTER (WHERE metric_date > $1::date - 2)                                           AS visits_2,
               SUM(visits) FILTER (WHERE metric_date <= $1::date - 2 AND metric_date > $1::date - 9)           AS visits_prior7
          FROM traffic_metrics
         WHERE product_channel_id = pc.id AND metric_date <= $1::date
        HAVING COUNT(*) > 0
       ) t ON true
  LEFT JOIN LATERAL (
        SELECT changed_at, previous_price, price FROM price_history
         WHERE product_channel_id = pc.id AND previous_price IS NOT NULL
         ORDER BY changed_at DESC LIMIT 1
       ) ph ON true
      WHERE pc.status = 'active' AND p.active`,
    [today, windowDays],
  )

  const feeRules = await getActiveFeeRules(today)
  const competition = COMPETITIVE_INTELLIGENCE_ACTIVE ? await loadCompetition(today, competitorFreshDays) : new Map<number, Competition>()

  return rows.map<ChannelStats & { category: string | null }>((r) => {
    const marketplaceId = Number(r.marketplace_id)
    const w = Number(r.window_days)
    const baseLen = Number(r.base_len)
    const historyDays = r.first_date ? daysBetween(r.first_date, today) + 1 : 0
    const hasTraffic = r.first_traffic_date !== null
    return {
      productChannelId: Number(r.product_channel_id),
      productId: Number(r.product_id),
      marketplaceId,
      marketplaceName: r.marketplace_name,
      productName: r.product_name,
      sku: r.sku,
      category: r.category,
      classification: r.classification,
      price: Number(r.current_price),
      windowDays: w,
      ordersCur: Number(r.orders_cur),
      ordersPrev: Number(r.orders_prev),
      unitsCur: Number(r.units_cur),
      stock: r.available_quantity === null ? null : Number(r.available_quantity),
      revenueCur: Number(r.revenue_cur),
      revenuePrev: Number(r.revenue_prev),
      ordersBase: Number(r.orders_base),
      revenueBase: Number(r.revenue_base),
      baseDays: coverage(r.first_date, w, baseLen, today),
      visitsCur: hasTraffic ? Number(r.visits_cur ?? 0) : null,
      visitsPrev: hasTraffic ? Number(r.visits_prev ?? 0) : null,
      visitsBase: hasTraffic ? Number(r.visits_base ?? 0) : null,
      trafficBaseDays: coverage(r.first_traffic_date, w, baseLen, today),
      historyDays,
      lastSaleDate: r.last_sale_date,
      saleDays90: Number(r.sale_days_90),
      observedDays90: Math.min(90, historyDays),
      lastPriceChange:
        r.price_change_date && r.price_change_price
          ? { date: r.price_change_date, previous: toNumber(r.price_change_previous), price: Number(r.price_change_price) }
          : null,
      pricing: priceChannel(
        {
          marketplaceId,
          price: Number(r.current_price),
          adsCostPct: Number(r.ads_cost_pct),
          sellerDiscount: Number(r.seller_discount),
          category: r.category,
          cost: toNumber(r.average_cost),
        },
        feeRules,
        targetMarginPct,
        minMarginPct,
      ),
      units2: Number(r.units_2),
      unitsD2: Number(r.units_d2),
      unitsPrior7: Number(r.units_prior7),
      visits2: hasTraffic ? Number(r.visits_2 ?? 0) : null,
      visitsPrior7: hasTraffic ? Number(r.visits_prior7 ?? 0) : null,
      units7: Number(r.units_7),
      units14: Number(r.units_14),
      units28: Number(r.units_28),
      revenue14: Number(r.revenue_14),
      revenue28: Number(r.revenue_28),
      saleDays14: Number(r.sale_days_14),
      saleDays28: Number(r.sale_days_28),
      competition: competition.get(Number(r.product_channel_id)) ?? null,
    }
  })
}

async function loadExperiments(today: string): Promise<ActiveExperiment[]> {
  const rows = await query<{
    id: string
    product_id: string
    product_channel_id: string | null
    variable: string
    previous_value: string
    new_value: string
    start_date: string
    evaluation_date: string
    status: string
    hypothesis: string
    days: number
    orders_before: string | null
    orders_during: string | null
    visits_before: string | null
    visits_during: string | null
    has_traffic: boolean
  }>(
    `SELECT e.id, e.product_id, e.product_channel_id, e.variable, e.previous_value, e.new_value, e.status, e.hypothesis,
            to_char(e.start_date,'YYYY-MM-DD') AS start_date,
            to_char(e.evaluation_date,'YYYY-MM-DD') AS evaluation_date,
            d.days, sm.orders_before, sm.orders_during, tm.visits_before, tm.visits_during,
            tm.n > 0 AS has_traffic
       FROM experiments e
 CROSS JOIN LATERAL (SELECT GREATEST(1, LEAST($1::date, e.evaluation_date) - e.start_date) AS days) d
  LEFT JOIN LATERAL (
        SELECT SUM(x.orders) FILTER (WHERE x.metric_date <  e.start_date) AS orders_before,
               SUM(x.orders) FILTER (WHERE x.metric_date >= e.start_date) AS orders_during
          FROM sales_metrics x JOIN product_channels pc ON pc.id = x.product_channel_id
         WHERE pc.product_id = e.product_id AND (e.product_channel_id IS NULL OR pc.id = e.product_channel_id)
           AND pc.marketplace_id = e.marketplace_id
           AND x.metric_date >= e.start_date - d.days AND x.metric_date < e.start_date + d.days
       ) sm ON true
  LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n,
               SUM(x.visits) FILTER (WHERE x.metric_date <  e.start_date) AS visits_before,
               SUM(x.visits) FILTER (WHERE x.metric_date >= e.start_date) AS visits_during
          FROM traffic_metrics x JOIN product_channels pc ON pc.id = x.product_channel_id
         WHERE pc.product_id = e.product_id AND (e.product_channel_id IS NULL OR pc.id = e.product_channel_id)
           AND pc.marketplace_id = e.marketplace_id
           AND x.metric_date >= e.start_date - d.days AND x.metric_date < e.start_date + d.days
       ) tm ON true
      WHERE e.status IN ('in_progress','ready_for_review')`,
    [today],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    productId: Number(r.product_id),
    productChannelId: r.product_channel_id ? Number(r.product_channel_id) : null,
    variable: r.variable,
    previousValue: r.previous_value,
    newValue: r.new_value,
    startDate: r.start_date,
    evaluationDate: r.evaluation_date,
    status: r.status,
    hypothesis: r.hypothesis,
    comparison: {
      days: Number(r.days),
      ordersBefore: Number(r.orders_before ?? 0),
      ordersDuring: Number(r.orders_during ?? 0),
      visitsBefore: r.has_traffic ? Number(r.visits_before ?? 0) : null,
      visitsDuring: r.has_traffic ? Number(r.visits_during ?? 0) : null,
    },
  }))
}

export type CommercialStatus = 'healthy' | 'attention' | 'critical' | 'insufficient_data'

export type ChannelHealth = {
  marketplaceId: number
  code: string
  name: string
  connection: string
  lastSuccessfulSync: string | null
  status: CommercialStatus
  reason: string
  channels: number
  revenueCur: number
  revenueExpected: number | null
}

async function computeHealth(
  channels: Awaited<ReturnType<typeof loadChannelStats>>,
  signals: Signal[],
  s: EngineSettings,
): Promise<ChannelHealth[]> {
  const marketplaces = await query<{ id: string; code: string; name: string; connection: string | null; last_ok: string | null }>(
    `SELECT m.id, m.code, m.name,
            (SELECT mc.status FROM marketplace_connections mc WHERE mc.marketplace_id = m.id
              ORDER BY (mc.status = 'connected') DESC, mc.updated_at DESC LIMIT 1) AS connection,
            (SELECT MAX(sj.finished_at) FROM sync_jobs sj WHERE sj.marketplace_id = m.id AND sj.status = 'success') AS last_ok
       FROM marketplaces m WHERE m.active ORDER BY m.id`,
  )

  return marketplaces.map((m) => {
    const id = Number(m.id)
    const mine = channels.filter((c) => c.marketplaceId === id)
    const mature = mine.filter((c) => c.historyDays >= s.minHistoryDays)
    const actionable = signals.filter((sg) => sg.marketplaceId === id && sg.kind !== 'no_action' && sg.kind !== 'opportunity')
    const critical = actionable.filter((sg) => sg.severity === 'critical').length
    const attention = actionable.filter((sg) => sg.severity === 'attention').length
    const revenueCur = mine.reduce((a, c) => a + c.revenueCur, 0)
    const expectedParts = mature.map((c) => {
      const b = baselineFor(c)
      return b.orders !== null && c.ordersBase > 0 && c.baseDays > 0 ? (c.revenueCur / Math.max(1, c.ordersCur)) * b.orders : null
    })
    const known = expectedParts.filter((v): v is number => v !== null)
    const revenueExpected = known.length ? known.reduce((a, v) => a + v, 0) : null
    const revenueDrop = revenueExpected && revenueExpected > 0 ? ((revenueCur - revenueExpected) / revenueExpected) * 100 : null

    let status: CommercialStatus
    let reason: string
    if (!mature.length) {
      status = 'insufficient_data'
      reason = mine.length
        ? `${mine.length} anúncio(s), histórico abaixo de ${s.minHistoryDays} dias.`
        : m.connection === 'connected'
          ? 'Conectado, aguardando dados sincronizados.'
          : 'Nenhum anúncio com dados.'
    } else if (critical) {
      status = 'critical'
      reason = `${critical} sinal(is) crítico(s) em aberto.`
    } else if (attention || (revenueDrop !== null && revenueDrop <= -s.significantChangePct)) {
      status = 'attention'
      reason = attention
        ? `${attention} ponto(s) de atenção.`
        : `Faturamento ${Math.round(revenueDrop!)}% abaixo da base.`
    } else {
      status = 'healthy'
      reason = 'Sem desvios relevantes frente à base histórica.'
    }

    return {
      marketplaceId: id,
      code: m.code,
      name: m.name,
      connection: m.connection ?? 'not_connected',
      lastSuccessfulSync: m.last_ok,
      status,
      reason,
      channels: mine.length,
      revenueCur,
      revenueExpected,
    }
  })
}

async function loadMemories(): Promise<StrategicMemory[]> {
  const rows = await query<{ id: string; product_id: string; kind: string; subject: string; decision: string }>(
    `SELECT id, product_id, kind, subject, decision FROM strategic_memory
      WHERE status = 'active' AND product_id IS NOT NULL ORDER BY memory_date DESC, id DESC`,
  )
  return rows.map((r) => ({ id: Number(r.id), productId: Number(r.product_id), kind: r.kind, subject: r.subject, decision: r.decision }))
}

/** Registered decisions travel with every signal of the product; a freeze holds commercial changes. */
function applyMemoryGuard(signals: Signal[], memories: StrategicMemory[]) {
  let held = 0
  const out = signals.map((sg) => {
    const mine = memories.filter((m) => m.productId === sg.productId)
    if (!mine.length) return sg
    const withMemory: Signal = {
      ...sg,
      evidence: [...sg.evidence, ...mine.slice(0, 2).map((m) => ({ label: 'FATO' as const, text: `Memória estratégica #${m.id}: ${m.decision}` }))],
    }
    const freeze = mine.find(isFreezeMemory)
    if (!freeze || !sg.suggestsChange || sg.severity === 'critical' || sg.kind === 'no_action') return withMemory
    held++
    return {
      ...withMemory,
      trace: [...(sg.trace ?? []), `Retido pela memória estratégica #${freeze.id}; ação original: ${sg.recommendation}`],
      kind: 'no_action' as const,
      severity: 'info' as const,
      actionType: 'information' as const,
      issue: `Sinal registrado, mas há uma decisão para não alterar este produto.`,
      recommendation: 'Respeitar a decisão registrada; reavaliar quando ela for revista.',
      reason: `Decisão #${freeze.id}: ${freeze.decision}`,
      suggestsChange: false,
      alert: undefined,
    }
  })
  return { signals: out, heldByMemory: held }
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function shortDate(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** Appends MÉTRICA, PERÍODO and sources so every card answers "how will we know it worked". */
function enrich(sg: Signal, today: string, windowDays: number, health: ChannelHealth[]): Signal {
  const meta = ruleMeta(sg.ruleCode)
  const mk = health.find((h) => h.marketplaceId === sg.marketplaceId)
  const from = addDays(today, -(windowDays - 1))
  return {
    ...sg,
    data: [
      ...sg.data,
      { label: 'Categoria', value: CATEGORY_LABEL[meta.category] },
      { label: 'Métrica de acompanhamento', value: meta.metric },
      ...(meta.reviewDays > 0 ? [{ label: 'Revisar em', value: `${shortDate(addDays(today, meta.reviewDays))} (${meta.reviewDays} dias)` }] : []),
      { label: 'Período analisado', value: `${shortDate(from)} a ${shortDate(today)}` },
      { label: 'Fonte', value: mk ? `${mk.name} · API (dados reais)` : 'ALURE' },
      ...(mk?.lastSuccessfulSync
        ? [{ label: 'Última sincronização', value: new Date(mk.lastSuccessfulSync).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) }]
        : []),
    ],
  }
}

export type EngineOverview = {
  marketplaceId: number
  name: string
  windowDays: number
  ordersCur: number
  ordersPrev: number
  revenueCur: number
  revenuePrev: number
  visitsCur: number | null
  visitsPrev: number | null
  channelsWithTraffic: number
  channelsWithSales: number
}

function buildOverview(channels: Awaited<ReturnType<typeof loadChannelStats>>, windowDays: number): EngineOverview[] {
  const byMk = new Map<number, EngineOverview>()
  for (const c of channels) {
    if (c.windowDays !== windowDays) continue
    const o = byMk.get(c.marketplaceId) ?? {
      marketplaceId: c.marketplaceId, name: c.marketplaceName, windowDays,
      ordersCur: 0, ordersPrev: 0, revenueCur: 0, revenuePrev: 0, visitsCur: null, visitsPrev: null,
      channelsWithTraffic: 0, channelsWithSales: 0,
    }
    o.ordersCur += c.ordersCur
    o.ordersPrev += c.ordersPrev
    o.revenueCur += c.revenueCur
    o.revenuePrev += c.revenuePrev
    if (c.ordersCur + c.ordersPrev > 0) o.channelsWithSales++
    if (c.visitsCur !== null) {
      o.channelsWithTraffic++
      o.visitsCur = (o.visitsCur ?? 0) + c.visitsCur
      o.visitsPrev = (o.visitsPrev ?? 0) + (c.visitsPrev ?? 0)
    }
    byMk.set(c.marketplaceId, o)
  }
  return [...byMk.values()]
}

/**
 * On the review date of an approved recommendation, compares the same number of days before
 * and after the decision and writes the result back to the memory record.
 * Returns how many records were closed. Silent no-op before migration 005.
 */
async function recordOutcomes(client: PoolClient, today: string) {
  await client.query('SAVEPOINT record_outcomes')
  try {
    const { rows } = await client.query<{
      id: string; days: number; orders_before: string; orders_after: string
      revenue_before: string; revenue_after: string; visits_before: string | null; visits_after: string | null
    }>(
      `SELECT m.id, (m.review_date - m.memory_date) AS days,
              COALESCE(sb.orders,0) AS orders_before, COALESCE(sa.orders,0) AS orders_after,
              COALESCE(sb.revenue,0) AS revenue_before, COALESCE(sa.revenue,0) AS revenue_after,
              tb.visits AS visits_before, ta.visits AS visits_after
         FROM strategic_memory m
    LEFT JOIN LATERAL (SELECT SUM(orders) orders, SUM(revenue) revenue FROM sales_metrics
                        WHERE product_channel_id = m.product_channel_id
                          AND metric_date <  m.memory_date AND metric_date >= m.memory_date - (m.review_date - m.memory_date)) sb ON true
    LEFT JOIN LATERAL (SELECT SUM(orders) orders, SUM(revenue) revenue FROM sales_metrics
                        WHERE product_channel_id = m.product_channel_id
                          AND metric_date >= m.memory_date AND metric_date < m.review_date) sa ON true
    LEFT JOIN LATERAL (SELECT SUM(visits) visits FROM traffic_metrics
                        WHERE product_channel_id = m.product_channel_id
                          AND metric_date <  m.memory_date AND metric_date >= m.memory_date - (m.review_date - m.memory_date)) tb ON true
    LEFT JOIN LATERAL (SELECT SUM(visits) visits FROM traffic_metrics
                        WHERE product_channel_id = m.product_channel_id
                          AND metric_date >= m.memory_date AND metric_date < m.review_date) ta ON true
        WHERE m.outcome IS NULL AND m.recommendation_id IS NOT NULL
          AND m.product_channel_id IS NOT NULL AND m.review_date <= $1::date`,
      [today],
    )
    for (const r of rows) {
      const ob = Number(r.orders_before), oa = Number(r.orders_after)
      const rb = Number(r.revenue_before), ra = Number(r.revenue_after)
      const delta = rb > 0 ? ((ra - rb) / rb) * 100 : null
      const verdict = delta === null ? (ra > 0 ? 'melhorou' : 'sem dados') : delta >= 10 ? 'melhorou' : delta <= -10 ? 'piorou' : 'estável'
      const visits = r.visits_before !== null && r.visits_after !== null ? ` · visitas ${r.visits_before} → ${r.visits_after}` : ''
      const text = `Resultado em ${r.days} dias: ${verdict}. Pedidos ${ob} → ${oa}; faturamento R$ ${rb.toFixed(2)} → R$ ${ra.toFixed(2)}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)` : ''}${visits}.`
      await client.query(
        `UPDATE strategic_memory SET outcome = $2, outcome_data = $3, outcome_at = now(), updated_at = now() WHERE id = $1`,
        [r.id, text, JSON.stringify({ verdict, days: r.days, ordersBefore: ob, ordersAfter: oa, revenueBefore: rb, revenueAfter: ra, revenueDeltaPct: delta, visitsBefore: r.visits_before, visitsAfter: r.visits_after })],
      )
    }
    await client.query('RELEASE SAVEPOINT record_outcomes')
    return rows.length
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT record_outcomes')
    if ((e as { code?: string }).code !== '42703') throw e
    return 0
  }
}

export async function runEngine(user: SessionUser | null, analysisRunId: number | null = null) {
  const today = todayISO()
  const settings = await getEngineSettings()
  const [channels, experiments, memories] = await Promise.all([
    loadChannelStats(today, settings.windowDays, settings.targetMarginPct, settings.competitorFreshDays, settings.minMarginPct),
    loadExperiments(today),
    loadMemories(),
  ])

  const raw = applyMotorCascade(
    channels.flatMap((c) => evaluateChannel(c, settings, today)),
    channels,
    settings,
  )
  const guarded = applyExperimentGuard(raw, experiments, today)
  const remembered = applyMemoryGuard(guarded.signals, memories)
  const preliminary: Signal[] = consolidateLostPace(remembered.signals)
  for (const exp of experiments) {
    const s = experimentReviewSignal(exp, today)
    if (s) preliminary.push(s)
  }

  const health = await computeHealth(channels, preliminary, settings)
  const signals = preliminary.map((sg) => enrich(sg, today, settings.windowDays, health))
  const overview = buildOverview(channels, settings.windowDays)

  const rulesFired: Record<string, number> = {}
  for (const sg of raw) rulesFired[sg.ruleCode] = (rulesFired[sg.ruleCode] ?? 0) + 1
  const ranked = signals.filter((sg) => sg.kind === 'priority' || sg.kind === 'test_review').sort((a, b) => b.score - a.score)
  const trace = {
    date: today,
    settings,
    inputs: {
      channels: channels.length,
      withSales: channels.filter((c) => c.ordersCur + c.ordersPrev + c.ordersBase > 0).length,
      withTraffic: channels.filter((c) => c.visitsCur !== null).length,
      historyDays: Math.max(0, ...channels.map((c) => c.historyDays)),
      missingCost: channels.filter((c) => c.pricing.status === 'missing_cost').length,
      missingFee: channels.filter((c) => c.pricing.status === 'missing_fee_rule').length,
      experiments: experiments.length,
      memories: memories.length,
    },
    overview,
    rulesFired,
    heldByTests: guarded.protectedCount,
    heldByMemory: remembered.heldByMemory,
    chosen: ranked.slice(0, 3).map((sg) => ({ fingerprint: sg.fingerprint, rule: sg.ruleCode, score: sg.score, title: sg.title })),
    transformed: signals
      .filter((sg) => sg.trace?.length)
      .map((sg) => ({ fingerprint: sg.fingerprint, rule: sg.ruleCode, steps: sg.trace })),
  }

  const historyEnabled = await hasAlertHistory()
  const summary = await withTransaction(async (client) => {
    await client.query(
      `UPDATE experiments SET status = 'ready_for_review', updated_at = now()
        WHERE status = 'in_progress' AND evaluation_date <= $1::date`,
      [today],
    )

    let created = 0
    for (const s of signals) {
      const { rows } = await client.query<{ id: string; inserted: boolean }>(
        `INSERT INTO recommendations
           (fingerprint, rule_code, kind, severity, action_type, confidence, priority_score,
            product_id, product_channel_id, marketplace_id, experiment_id,
            title, issue, evidence, evidence_data, recommendation, reason, objective, analysis_run_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (fingerprint) DO UPDATE SET
           rule_code = EXCLUDED.rule_code, kind = EXCLUDED.kind, severity = EXCLUDED.severity,
           action_type = EXCLUDED.action_type, confidence = EXCLUDED.confidence,
           priority_score = EXCLUDED.priority_score, experiment_id = EXCLUDED.experiment_id,
           title = EXCLUDED.title, issue = EXCLUDED.issue, evidence = EXCLUDED.evidence,
           evidence_data = EXCLUDED.evidence_data, recommendation = EXCLUDED.recommendation,
           reason = EXCLUDED.reason, objective = EXCLUDED.objective,
           analysis_run_id = EXCLUDED.analysis_run_id, updated_at = now(),
           status = CASE WHEN recommendations.status = 'resolved' THEN 'open' ELSE recommendations.status END,
           resolved_at = CASE WHEN recommendations.status = 'resolved' THEN NULL ELSE recommendations.resolved_at END
         RETURNING id, (xmax = 0) AS inserted`,
        [
          s.fingerprint, s.ruleCode, s.kind, s.severity, s.actionType, s.confidence, s.score,
          s.productId, s.productChannelId, s.marketplaceId, s.experimentId,
          s.title, s.issue, JSON.stringify(s.evidence), JSON.stringify(s.data),
          s.recommendation, s.reason, s.objective, analysisRunId,
        ],
      )
      if (rows[0]?.inserted) {
        created++
        await client.query(
          `INSERT INTO recommendation_events (recommendation_id, event, user_id) VALUES ($1, 'created', $2)`,
          [rows[0].id, user?.id ?? null],
        )
      }

      if (s.alert) {
        const alertFingerprint = `${s.alert.type}:${s.productChannelId ?? s.experimentId}`
        const before = await client.query<{ status: string; severity: string }>(
          `SELECT status, severity FROM alerts WHERE fingerprint = $1`,
          [alertFingerprint],
        )
        // Same event updates the existing alert. Dismissed/acknowledged only come back on escalation.
        const { rows: alertRows } = await client.query<{ id: string; status: string }>(
          `INSERT INTO alerts (fingerprint, alert_type, severity, product_id, product_channel_id, marketplace_id, experiment_id, message, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (fingerprint) DO UPDATE SET
             status = CASE
               WHEN alerts.status = 'resolved' THEN 'open'
               WHEN alerts.status IN ('dismissed','acknowledged')
                    AND ${SEVERITY_RANK_SQL('EXCLUDED.severity')} > ${SEVERITY_RANK_SQL('alerts.severity')} THEN 'open'
               ELSE alerts.status END,
             severity = EXCLUDED.severity, message = EXCLUDED.message, data = EXCLUDED.data, updated_at = now()
           RETURNING id, status`,
          [
            alertFingerprint,
            s.alert.type, s.alert.severity, s.productId, s.productChannelId, s.marketplaceId,
            s.experimentId, s.alert.message,
            JSON.stringify({ evidence: s.evidence, data: s.data, rule: s.ruleCode, recommendation: s.recommendation }),
          ],
        )
        const prev = before.rows[0]
        const event = !prev
          ? 'created'
          : prev.status === 'resolved'
            ? 'reopened'
            : severityRank(s.alert.severity) > severityRank(prev.severity)
              ? 'escalated'
              : null
        if (event && alertRows[0] && historyEnabled) {
          await client.query(
            `INSERT INTO alert_events (alert_id, event, severity, user_id, data) VALUES ($1,$2,$3,$4,$5)`,
            [alertRows[0].id, event, s.alert.severity, user?.id ?? null, JSON.stringify({ rule: s.ruleCode, message: s.alert.message, data: s.data })],
          )
        }
      }
    }

    const fingerprints = signals.map((s) => s.fingerprint)
    const alertFingerprints = signals
      .filter((s) => s.alert)
      .map((s) => `${s.alert!.type}:${s.productChannelId ?? s.experimentId}`)

    const resolved = await client.query(
      `UPDATE recommendations SET status = 'resolved', resolved_at = now(), updated_at = now()
        WHERE status = 'open' AND NOT (fingerprint = ANY($1::text[]))`,
      [fingerprints],
    )
    const autoResolved = await client.query<{ id: string; severity: string }>(
      `UPDATE alerts SET status = 'resolved', updated_at = now()
        WHERE status <> 'resolved' AND NOT (fingerprint = ANY($1::text[]))
        RETURNING id, severity`,
      [alertFingerprints],
    )
    if (historyEnabled) {
      for (const a of autoResolved.rows) {
        await client.query(
          `INSERT INTO alert_events (alert_id, event, severity, data) VALUES ($1,'auto_resolved',$2,$3)`,
          [a.id, a.severity, JSON.stringify({ reason: 'Condição deixou de ser detectada pelo motor.' })],
        )
      }
    }

    const outcomes = await recordOutcomes(client, today)

    const result = {
      outcomesRecorded: outcomes,
      channelsAnalyzed: channels.length,
      signals: signals.length,
      created,
      resolved: resolved.rowCount ?? 0,
      protectedByTests: guarded.protectedCount,
      protectedByMemory: remembered.heldByMemory,
    }
    await logAudit(
      {
        user,
        action: 'engine.run',
        entityType: 'recommendations',
        entityId: analysisRunId ? String(analysisRunId) : undefined,
        newValue: { ...result, trace },
      },
      client,
    )
    return result
  })

  return { ...summary, health, overview }
}

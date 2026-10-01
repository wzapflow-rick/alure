import 'server-only'
import { query, queryOne } from '@/lib/db'
import { todayISO } from '@/lib/format'
import type { Evidence, EvidenceDatum } from '@/lib/engine/rules'
import type { AIBriefBlock } from '@/lib/ai/schemas'

export type Marketplace = { id: string; code: string; name: string }

export async function listMarketplaces() {
  return query<Marketplace>('SELECT id, code, name FROM marketplaces WHERE active ORDER BY id')
}

export async function getConnections() {
  return query<{
    marketplace_id: string
    code: string
    name: string
    status: string | null
    account_name: string | null
    connected_at: string | null
    last_sync: string | null
    last_sync_status: string | null
  }>(
    `SELECT m.id AS marketplace_id, m.code, m.name, c.status, c.account_name, c.connected_at,
            j.finished_at AS last_sync, j.status AS last_sync_status
       FROM marketplaces m
  LEFT JOIN LATERAL (SELECT * FROM marketplace_connections mc WHERE mc.marketplace_id = m.id
                      ORDER BY (mc.status = 'connected') DESC, mc.updated_at DESC LIMIT 1) c ON true
  LEFT JOIN LATERAL (SELECT finished_at, status FROM sync_jobs sj WHERE sj.marketplace_id = m.id
                      ORDER BY created_at DESC LIMIT 1) j ON true
      WHERE m.active ORDER BY m.id`,
  )
}

export async function getTodayKpis() {
  const today = todayISO()
  const row = await queryOne<{ revenue: string | null; orders: string | null; any_data: boolean; last_synced: string | null }>(
    `SELECT SUM(revenue) FILTER (WHERE metric_date = $1::date) AS revenue,
            SUM(orders)  FILTER (WHERE metric_date = $1::date) AS orders,
            COUNT(*) > 0 AS any_data,
            MAX(synced_at) AS last_synced
       FROM sales_metrics`,
    [today],
  )
  const revenue = Number(row?.revenue ?? 0)
  const orders = Number(row?.orders ?? 0)
  return {
    hasData: Boolean(row?.any_data),
    revenue,
    orders,
    aov: orders > 0 ? revenue / orders : null,
    lastSynced: row?.last_synced ?? null,
  }
}

export async function getChannelPerformance(windowDays: number) {
  const today = todayISO()
  return query<{
    marketplace_id: string
    name: string
    revenue_cur: string
    revenue_prev: string
    orders_cur: string
    orders_prev: string
    visits_cur: string | null
  }>(
    `SELECT m.id AS marketplace_id, m.name,
            COALESCE(SUM(sm.revenue) FILTER (WHERE sm.metric_date >  $1::date - $2::int),0) AS revenue_cur,
            COALESCE(SUM(sm.revenue) FILTER (WHERE sm.metric_date <= $1::date - $2::int),0) AS revenue_prev,
            COALESCE(SUM(sm.orders)  FILTER (WHERE sm.metric_date >  $1::date - $2::int),0) AS orders_cur,
            COALESCE(SUM(sm.orders)  FILTER (WHERE sm.metric_date <= $1::date - $2::int),0) AS orders_prev,
            (SELECT SUM(tm.visits) FROM traffic_metrics tm JOIN product_channels pc2 ON pc2.id = tm.product_channel_id
              WHERE pc2.marketplace_id = m.id AND tm.metric_date > $1::date - $2::int AND tm.metric_date <= $1::date) AS visits_cur
       FROM marketplaces m
       JOIN product_channels pc ON pc.marketplace_id = m.id
       JOIN sales_metrics sm ON sm.product_channel_id = pc.id
                            AND sm.metric_date > $1::date - 2*$2::int AND sm.metric_date <= $1::date
      WHERE m.code <> 'upseller'
      GROUP BY m.id, m.name ORDER BY revenue_cur DESC`,
    [today, windowDays],
  )
}

export type RecommendationRow = {
  id: string
  rule_code: string
  kind: string
  severity: string
  action_type: string
  confidence: string
  priority_score: number
  product_id: string | null
  experiment_id: string | null
  title: string
  issue: string
  evidence: Evidence[]
  evidence_data: EvidenceDatum[]
  recommendation: string
  reason: string
  objective: string
  status: string
  updated_at: string
  sku: string | null
}

const REC_SELECT = `SELECT r.id, r.rule_code, r.kind, r.severity, r.action_type, r.confidence, r.priority_score,
       r.product_id, r.experiment_id, r.title, r.issue, r.evidence, r.evidence_data, r.recommendation, r.reason, r.objective,
       r.status, r.updated_at, p.sku
  FROM recommendations r LEFT JOIN products p ON p.id = r.product_id`

export async function listRecommendations(opts: { kinds?: string[]; statuses?: string[]; productId?: number; limit?: number }) {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.kinds?.length) {
    params.push(opts.kinds)
    where.push(`r.kind = ANY($${params.length}::text[])`)
  }
  if (opts.statuses?.length) {
    params.push(opts.statuses)
    where.push(`r.status = ANY($${params.length}::text[])`)
  }
  if (opts.productId) {
    params.push(opts.productId)
    where.push(`r.product_id = $${params.length}`)
  }
  params.push(opts.limit ?? 50)
  return query<RecommendationRow>(
    `${REC_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.priority_score DESC, r.updated_at DESC LIMIT $${params.length}`,
    params,
  )
}

export async function listAlerts(statuses: string[] = ['open', 'acknowledged'], limit = 100) {
  return query<{
    id: string
    alert_type: string
    severity: string
    message: string
    status: string
    product_id: string | null
    experiment_id: string | null
    updated_at: string
  }>(
    `SELECT id, alert_type, severity, message, status, product_id, experiment_id, updated_at
       FROM alerts WHERE status = ANY($1::text[])
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'attention' THEN 1 WHEN 'positive' THEN 2 ELSE 3 END, updated_at DESC
      LIMIT $2`,
    [statuses, limit],
  )
}

export type ExperimentRow = {
  id: string
  product_id: string
  product_name: string
  sku: string
  marketplace_name: string
  product_channel_id: string | null
  variable: string
  previous_value: string
  new_value: string
  hypothesis: string
  start_date: string
  evaluation_date: string
  primary_metric: string
  secondary_metrics: string[]
  status: string
  result: string | null
  recommended_decision: string | null
  decision: string | null
  decision_notes: string | null
  decided_at: string | null
}

const EXP_SELECT = `SELECT e.id, e.product_id, p.name AS product_name, p.sku, m.name AS marketplace_name,
       e.product_channel_id, e.variable, e.previous_value, e.new_value, e.hypothesis,
       to_char(e.start_date,'YYYY-MM-DD') AS start_date, to_char(e.evaluation_date,'YYYY-MM-DD') AS evaluation_date,
       e.primary_metric, e.secondary_metrics, e.status, e.result, e.recommended_decision, e.decision,
       e.decision_notes, e.decided_at
  FROM experiments e JOIN products p ON p.id = e.product_id JOIN marketplaces m ON m.id = e.marketplace_id`

export async function listExperiments(opts: { statuses?: string[]; productId?: number } = {}) {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.statuses?.length) {
    params.push(opts.statuses)
    where.push(`e.status = ANY($${params.length}::text[])`)
  }
  if (opts.productId) {
    params.push(opts.productId)
    where.push(`e.product_id = $${params.length}`)
  }
  return query<ExperimentRow>(
    `${EXP_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE e.status WHEN 'ready_for_review' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
              e.evaluation_date`,
    params,
  )
}

export async function getExperiment(id: number) {
  return queryOne<ExperimentRow>(`${EXP_SELECT} WHERE e.id = $1`, [id])
}

/** Before × after on the channel (or all channels of the product) for the same number of days. */
export async function getExperimentComparison(exp: ExperimentRow) {
  const end = exp.status === 'completed' && exp.decided_at ? exp.decided_at.slice(0, 10) : todayISO()
  const row = await queryOne<{
    days: number
    base_orders: string | null
    base_revenue: string | null
    base_visits: string | null
    test_orders: string | null
    test_revenue: string | null
    test_visits: string | null
    base_rows: string
    test_rows: string
  }>(
    `WITH ch AS (
       SELECT id FROM product_channels
        WHERE ($1::bigint IS NOT NULL AND id = $1) OR ($1::bigint IS NULL AND product_id = $2)
     ), win AS (
       SELECT $3::date AS start, LEAST($4::date, $5::date) AS stop
     ), d AS (SELECT GREATEST(1, (SELECT stop - start + 1 FROM win)) AS days)
     SELECT (SELECT days FROM d) AS days,
       (SELECT SUM(orders)  FROM sales_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date >= (SELECT start FROM win) - (SELECT days FROM d) AND metric_date < (SELECT start FROM win)) AS base_orders,
       (SELECT SUM(revenue) FROM sales_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date >= (SELECT start FROM win) - (SELECT days FROM d) AND metric_date < (SELECT start FROM win)) AS base_revenue,
       (SELECT SUM(visits)  FROM traffic_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date >= (SELECT start FROM win) - (SELECT days FROM d) AND metric_date < (SELECT start FROM win)) AS base_visits,
       (SELECT SUM(orders)  FROM sales_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date BETWEEN (SELECT start FROM win) AND (SELECT stop FROM win)) AS test_orders,
       (SELECT SUM(revenue) FROM sales_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date BETWEEN (SELECT start FROM win) AND (SELECT stop FROM win)) AS test_revenue,
       (SELECT SUM(visits)  FROM traffic_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date BETWEEN (SELECT start FROM win) AND (SELECT stop FROM win)) AS test_visits,
       (SELECT COUNT(*) FROM sales_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date >= (SELECT start FROM win) - (SELECT days FROM d) AND metric_date < (SELECT start FROM win)) AS base_rows,
       (SELECT COUNT(*) FROM sales_metrics WHERE product_channel_id IN (SELECT id FROM ch) AND metric_date BETWEEN (SELECT start FROM win) AND (SELECT stop FROM win)) AS test_rows`,
    [exp.product_channel_id, exp.product_id, exp.start_date, exp.evaluation_date, end],
  )
  return row
}

export type MemoryRow = {
  id: string
  memory_date: string
  kind: string
  subject: string
  decision: string
  reason: string | null
  expected_result: string | null
  product_id: string | null
  product_name: string | null
  experiment_id: string | null
  status: string
  user_name: string | null
  review_date: string | null
  outcome: string | null
}

export async function listMemory(opts: { productId?: number; limit?: number; status?: string } = {}) {
  const params: unknown[] = []
  const where: string[] = []
  if (opts.productId) {
    params.push(opts.productId)
    where.push(`sm.product_id = $${params.length}`)
  }
  if (opts.status) {
    params.push(opts.status)
    where.push(`sm.status = $${params.length}`)
  }
  params.push(opts.limit ?? 200)
  const sql = (outcomeCols: string) =>
    `SELECT sm.id, to_char(sm.memory_date,'YYYY-MM-DD') AS memory_date, sm.kind, sm.subject, sm.decision,
            sm.reason, sm.expected_result, sm.product_id, p.name AS product_name, sm.experiment_id,
            sm.status, u.name AS user_name, ${outcomeCols}
       FROM strategic_memory sm
  LEFT JOIN products p ON p.id = sm.product_id
  LEFT JOIN "user" u ON u.id = sm.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sm.memory_date DESC, sm.id DESC LIMIT $${params.length}`
  try {
    return await query<MemoryRow>(sql(`to_char(sm.review_date,'YYYY-MM-DD') AS review_date, sm.outcome`), params)
  } catch (e) {
    if ((e as { code?: string }).code !== '42703') throw e
    return query<MemoryRow>(sql('NULL::text AS review_date, NULL::text AS outcome'), params)
  }
}

export type ProductListRow = {
  id: string
  sku: string
  name: string
  category: string | null
  classification: string
  active: boolean
  average_cost: string | null
  channels: number
  revenue_30d: string | null
  orders_30d: string | null
}

export async function listProducts() {
  return query<ProductListRow>(
    `SELECT p.id, p.sku, p.name, p.category, p.classification, p.active, pc2.average_cost,
            (SELECT COUNT(*)::int FROM product_channels pc WHERE pc.product_id = p.id) AS channels,
            (SELECT SUM(sm.revenue) FROM sales_metrics sm JOIN product_channels pc ON pc.id = sm.product_channel_id
              WHERE pc.product_id = p.id AND sm.metric_date > $1::date - 30) AS revenue_30d,
            (SELECT SUM(sm.orders) FROM sales_metrics sm JOIN product_channels pc ON pc.id = sm.product_channel_id
              WHERE pc.product_id = p.id AND sm.metric_date > $1::date - 30) AS orders_30d
       FROM products p LEFT JOIN product_costs pc2 ON pc2.product_id = p.id
      ORDER BY p.active DESC, p.name`,
    [todayISO()],
  )
}

export async function listProductIndex() {
  return query<{ id: string; sku: string; name: string; average_cost: string | null }>(
    `SELECT p.id, p.sku, p.name, pc.average_cost
       FROM products p LEFT JOIN product_costs pc ON pc.product_id = p.id
      WHERE p.active
      ORDER BY p.sku`,
  )
}

export async function getProduct(id: number) {
  return queryOne<{
    id: string
    sku: string
    name: string
    brand: string
    category: string | null
    classification: string
    classification_reason: string | null
    active: boolean
    notes: string | null
    acquisition_cost: string | null
    average_cost: string | null
    cost_effective_date: string | null
  }>(
    `SELECT p.*, pc.acquisition_cost, pc.average_cost, to_char(pc.cost_effective_date,'YYYY-MM-DD') AS cost_effective_date
       FROM products p LEFT JOIN product_costs pc ON pc.product_id = p.id WHERE p.id = $1`,
    [id],
  )
}

export async function getProductChannels(productId: number) {
  return query<{
    id: string
    marketplace_id: string
    marketplace_name: string
    external_id: string | null
    listing_title: string | null
    current_price: string
    ads_cost_pct: string
    seller_discount: string
    promotion_active: boolean
    status: string
  }>(
    `SELECT pc.id, pc.marketplace_id, m.name AS marketplace_name, pc.external_id, pc.listing_title,
            pc.current_price, pc.ads_cost_pct, pc.seller_discount, pc.promotion_active, pc.status
       FROM product_channels pc JOIN marketplaces m ON m.id = pc.marketplace_id
      WHERE pc.product_id = $1 ORDER BY m.id`,
    [productId],
  )
}

export async function getCostLots(productId: number) {
  return query<{
    id: string
    quantity: number
    unit_cost: string
    effective_date: string
    supplier: string | null
    notes: string | null
    active: boolean
  }>(
    `SELECT id, quantity, unit_cost, to_char(effective_date,'YYYY-MM-DD') AS effective_date, supplier, notes, active
       FROM product_cost_history WHERE product_id = $1 ORDER BY effective_date DESC, id DESC`,
    [productId],
  )
}

export async function getPriceHistory(productId: number) {
  return query<{
    id: string
    marketplace_name: string
    previous_price: string | null
    price: string
    source: string
    reason: string | null
    changed_at: string
  }>(
    `SELECT ph.id, m.name AS marketplace_name, ph.previous_price, ph.price, ph.source, ph.reason, ph.changed_at
       FROM price_history ph JOIN product_channels pc ON pc.id = ph.product_channel_id
       JOIN marketplaces m ON m.id = pc.marketplace_id
      WHERE pc.product_id = $1 ORDER BY ph.changed_at DESC LIMIT 30`,
    [productId],
  )
}

export async function listFeeRules() {
  return query<{
    id: string
    marketplace_name: string
    name: string
    percentage_fee: string
    fixed_fee: string
    additional_fee_pct: string
    additional_fixed_fee: string
    min_price: string | null
    max_price: string | null
    category: string | null
    effective_from: string
    effective_to: string | null
    active: boolean
    notes: string | null
  }>(
    `SELECT f.id, m.name AS marketplace_name, f.name, f.percentage_fee, f.fixed_fee, f.additional_fee_pct,
            f.additional_fixed_fee, f.min_price, f.max_price, f.category,
            to_char(f.effective_from,'YYYY-MM-DD') AS effective_from,
            to_char(f.effective_to,'YYYY-MM-DD') AS effective_to, f.active, f.notes
       FROM fee_rules f JOIN marketplaces m ON m.id = f.marketplace_id
      ORDER BY m.id, f.active DESC, f.effective_from DESC, f.min_price NULLS FIRST`,
  )
}

export async function listAuditLogs(limit = 100) {
  return query<{
    id: string
    created_at: string
    user_email: string | null
    action: string
    entity_type: string
    entity_id: string | null
    reason: string | null
  }>(
    `SELECT id, created_at, user_email, action, entity_type, entity_id, reason
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
}

export async function getDailySummary(date = todayISO()) {
  return queryOne<{ content: DailyBrief; generated_at: string }>(
    'SELECT content, generated_at FROM daily_summaries WHERE summary_date = $1::date',
    [date],
  )
}

export async function listDailySummaries(limit = 60) {
  return query<{ summary_date: string; summary: string | null; revenue: string | null; orders: number | null }>(
    `SELECT to_char(summary_date,'YYYY-MM-DD') AS summary_date, content->>'summary' AS summary, revenue, orders
       FROM daily_summaries ORDER BY summary_date DESC LIMIT $1`,
    [limit],
  )
}

export type BriefTone = 'critical' | 'attention' | 'positive' | 'info' | 'neutral'
export type BriefItem = { text: string; tone: BriefTone; href?: string }

/** Older briefs only have `lines`; the structured sections were added in schema 002. */
export type DailyBrief = {
  date: string
  lines: { label: string; text: string; tone: BriefTone }[]
  summary?: string
  positives?: BriefItem[]
  risks?: BriefItem[]
  opportunities?: BriefItem[]
  actions?: BriefItem[]
  tests?: BriefItem[]
  ai?: AIBriefBlock
}

import 'server-only'
import { query, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { daysBetween, todayISO, toNumber } from '@/lib/format'
import { getActiveFeeRules, priceChannel } from '@/lib/pricing/service'
import { getEngineSettings, type EngineSettings } from '@/lib/settings'
import type { SessionUser } from '@/lib/session'
import {
  applyExperimentGuard,
  baselineFor,
  evaluateChannel,
  experimentReviewSignal,
  type ActiveExperiment,
  type ChannelStats,
  type Classification,
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
  revenue_cur: string
  revenue_prev: string
  orders_base: string
  last_sale_date: string | null
  sale_days_90: string
  first_traffic_date: string | null
  visits_cur: string | null
  visits_prev: string | null
  visits_base: string | null
  price_change_date: string | null
  price_change_previous: string | null
  price_change_price: string | null
}

/** Days of [start, end] covered by data that begins at firstDate. */
function coverage(firstDate: string | null, startOffset: number, length: number, today: string) {
  if (!firstDate) return 0
  const sinceFirst = daysBetween(firstDate, today) + 1
  return Math.max(0, Math.min(length, sinceFirst - startOffset))
}

export async function loadChannelStats(today: string, windowDays: number, targetMarginPct: number) {
  const rows = await query<ChannelRow>(
    `SELECT pc.id AS product_channel_id, pc.product_id, pc.marketplace_id, m.name AS marketplace_name,
            p.name AS product_name, p.sku, p.category, p.classification,
            pc.current_price, pc.ads_cost_pct, pc.seller_discount, pcs.average_cost,
            win.w AS window_days, win.base_len,
            to_char(s.first_date,'YYYY-MM-DD') AS first_date,
            COALESCE(s.orders_cur,0) AS orders_cur, COALESCE(s.orders_prev,0) AS orders_prev,
            COALESCE(s.revenue_cur,0) AS revenue_cur, COALESCE(s.revenue_prev,0) AS revenue_prev,
            COALESCE(s.orders_base,0) AS orders_base,
            to_char(s.last_sale_date,'YYYY-MM-DD') AS last_sale_date,
            COALESCE(s.sale_days_90,0) AS sale_days_90,
            to_char(t.first_date,'YYYY-MM-DD') AS first_traffic_date,
            t.visits_cur, t.visits_prev, t.visits_base,
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
               SUM(revenue) FILTER (WHERE metric_date >  $1::date - win.w)                                         AS revenue_cur,
               SUM(revenue) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - 2*win.w)    AS revenue_prev,
               SUM(orders)  FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - win.w - win.base_len) AS orders_base,
               MAX(metric_date) FILTER (WHERE orders > 0)                                                          AS last_sale_date,
               COUNT(*) FILTER (WHERE orders > 0 AND metric_date > $1::date - 90)                                  AS sale_days_90
          FROM sales_metrics
         WHERE product_channel_id = pc.id AND metric_date <= $1::date
       ) s ON true
  LEFT JOIN LATERAL (
        SELECT MIN(metric_date) AS first_date,
               SUM(visits) FILTER (WHERE metric_date >  $1::date - win.w)                                      AS visits_cur,
               SUM(visits) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - 2*win.w) AS visits_prev,
               SUM(visits) FILTER (WHERE metric_date <= $1::date - win.w AND metric_date > $1::date - win.w - win.base_len) AS visits_base
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
      revenueCur: Number(r.revenue_cur),
      revenuePrev: Number(r.revenue_prev),
      ordersBase: Number(r.orders_base),
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
      ),
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

export async function runEngine(user: SessionUser | null, analysisRunId: number | null = null) {
  const today = todayISO()
  const settings = await getEngineSettings()
  const [channels, experiments] = await Promise.all([
    loadChannelStats(today, settings.windowDays, settings.targetMarginPct),
    loadExperiments(today),
  ])

  const guarded = applyExperimentGuard(
    channels.flatMap((c) => evaluateChannel(c, settings, today)),
    experiments,
    today,
  )
  const signals: Signal[] = guarded.signals
  for (const exp of experiments) {
    const s = experimentReviewSignal(exp, today)
    if (s) signals.push(s)
  }

  const health = await computeHealth(channels, signals, settings)

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
        await client.query(
          `INSERT INTO alerts (fingerprint, alert_type, severity, product_id, product_channel_id, marketplace_id, experiment_id, message, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (fingerprint) DO UPDATE SET
             severity = EXCLUDED.severity, message = EXCLUDED.message, data = EXCLUDED.data, updated_at = now(),
             status = CASE WHEN alerts.status = 'resolved' THEN 'open' ELSE alerts.status END`,
          [
            `${s.alert.type}:${s.productChannelId ?? s.experimentId}`,
            s.alert.type, s.alert.severity, s.productId, s.productChannelId, s.marketplaceId,
            s.experimentId, s.alert.message, JSON.stringify({ evidence: s.evidence, data: s.data }),
          ],
        )
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
    await client.query(
      `UPDATE alerts SET status = 'resolved', updated_at = now()
        WHERE status <> 'resolved' AND NOT (fingerprint = ANY($1::text[]))`,
      [alertFingerprints],
    )

    const result = {
      channelsAnalyzed: channels.length,
      signals: signals.length,
      created,
      resolved: resolved.rowCount ?? 0,
      protectedByTests: guarded.protectedCount,
    }
    await logAudit(
      { user, action: 'engine.run', entityType: 'recommendations', entityId: analysisRunId ? String(analysisRunId) : undefined, newValue: result },
      client,
    )
    return result
  })

  return { ...summary, health }
}

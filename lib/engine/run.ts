import 'server-only'
import { query, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { todayISO, toNumber } from '@/lib/format'
import { getActiveFeeRules, priceChannel } from '@/lib/pricing/service'
import { getEngineSettings } from '@/lib/settings'
import type { SessionUser } from '@/lib/session'
import {
  applyExperimentGuard,
  evaluateChannel,
  experimentReviewSignal,
  type ActiveExperiment,
  type ChannelStats,
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
  current_price: string
  ads_cost_pct: string
  seller_discount: string
  average_cost: string | null
  orders_cur: string
  orders_prev: string
  revenue_cur: string
  revenue_prev: string
  visits_cur: string | null
  visits_prev: string | null
  history_days: string
  last_sale_date: string | null
}

export async function loadChannelStats(today: string, windowDays: number, targetMarginPct: number) {
  const rows = await query<ChannelRow>(
    `SELECT pc.id AS product_channel_id, pc.product_id, pc.marketplace_id, m.name AS marketplace_name,
            p.name AS product_name, p.sku, p.category, pc.current_price, pc.ads_cost_pct, pc.seller_discount,
            pcs.average_cost,
            COALESCE(s.orders_cur,0) AS orders_cur, COALESCE(s.orders_prev,0) AS orders_prev,
            COALESCE(s.revenue_cur,0) AS revenue_cur, COALESCE(s.revenue_prev,0) AS revenue_prev,
            t.visits_cur, t.visits_prev,
            COALESCE(s.history_days,0) AS history_days,
            to_char(s.last_sale_date,'YYYY-MM-DD') AS last_sale_date
       FROM product_channels pc
       JOIN products p ON p.id = pc.product_id
       JOIN marketplaces m ON m.id = pc.marketplace_id
  LEFT JOIN product_costs pcs ON pcs.product_id = p.id AND pcs.active
  LEFT JOIN LATERAL (
        SELECT SUM(orders)  FILTER (WHERE metric_date >  $1::date - $2::int)                                      AS orders_cur,
               SUM(orders)  FILTER (WHERE metric_date <= $1::date - $2::int AND metric_date > $1::date - 2*$2::int) AS orders_prev,
               SUM(revenue) FILTER (WHERE metric_date >  $1::date - $2::int)                                      AS revenue_cur,
               SUM(revenue) FILTER (WHERE metric_date <= $1::date - $2::int AND metric_date > $1::date - 2*$2::int) AS revenue_prev,
               COUNT(*) AS history_days,
               MAX(metric_date) FILTER (WHERE orders > 0) AS last_sale_date
          FROM sales_metrics
         WHERE product_channel_id = pc.id AND metric_date <= $1::date
       ) s ON true
  LEFT JOIN LATERAL (
        SELECT SUM(visits) FILTER (WHERE metric_date >  $1::date - $2::int)                                      AS visits_cur,
               SUM(visits) FILTER (WHERE metric_date <= $1::date - $2::int AND metric_date > $1::date - 2*$2::int) AS visits_prev,
               COUNT(*) AS n
          FROM traffic_metrics
         WHERE product_channel_id = pc.id AND metric_date <= $1::date AND metric_date > $1::date - 2*$2::int
       ) t ON t.n > 0
      WHERE pc.status = 'active' AND p.active`,
    [today, windowDays],
  )

  const feeRules = await getActiveFeeRules(today)

  return rows.map<ChannelStats & { category: string | null }>((r) => {
    const marketplaceId = Number(r.marketplace_id)
    return {
      productChannelId: Number(r.product_channel_id),
      productId: Number(r.product_id),
      marketplaceId,
      marketplaceName: r.marketplace_name,
      productName: r.product_name,
      sku: r.sku,
      category: r.category,
      ordersCur: Number(r.orders_cur),
      ordersPrev: Number(r.orders_prev),
      revenueCur: Number(r.revenue_cur),
      revenuePrev: Number(r.revenue_prev),
      visitsCur: toNumber(r.visits_cur),
      visitsPrev: toNumber(r.visits_prev),
      historyDays: Number(r.history_days),
      lastSaleDate: r.last_sale_date,
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

async function loadExperiments(): Promise<ActiveExperiment[]> {
  const rows = await query<{
    id: string
    product_id: string
    product_channel_id: string | null
    variable: string
    start_date: string
    evaluation_date: string
    status: string
    hypothesis: string
  }>(
    `SELECT id, product_id, product_channel_id, variable, status, hypothesis,
            to_char(start_date,'YYYY-MM-DD') AS start_date,
            to_char(evaluation_date,'YYYY-MM-DD') AS evaluation_date
       FROM experiments WHERE status IN ('in_progress','ready_for_review')`,
  )
  return rows.map((r) => ({
    id: Number(r.id),
    productId: Number(r.product_id),
    productChannelId: r.product_channel_id ? Number(r.product_channel_id) : null,
    variable: r.variable,
    startDate: r.start_date,
    evaluationDate: r.evaluation_date,
    status: r.status,
    hypothesis: r.hypothesis,
  }))
}

export async function runEngine(user: SessionUser | null) {
  const today = todayISO()
  const settings = await getEngineSettings()
  const [channels, experiments] = await Promise.all([
    loadChannelStats(today, settings.windowDays, settings.minMarginPct * 2),
    loadExperiments(),
  ])

  let signals: Signal[] = channels.flatMap((c) => evaluateChannel(c, settings, today))
  signals = applyExperimentGuard(signals, experiments, today)
  for (const exp of experiments) {
    const s = experimentReviewSignal(exp, today)
    if (s) signals.push(s)
  }

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
            title, issue, evidence, recommendation, reason, objective)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (fingerprint) DO UPDATE SET
           kind = EXCLUDED.kind, severity = EXCLUDED.severity, action_type = EXCLUDED.action_type,
           confidence = EXCLUDED.confidence, priority_score = EXCLUDED.priority_score,
           experiment_id = EXCLUDED.experiment_id, title = EXCLUDED.title, issue = EXCLUDED.issue,
           evidence = EXCLUDED.evidence, recommendation = EXCLUDED.recommendation,
           reason = EXCLUDED.reason, objective = EXCLUDED.objective, updated_at = now(),
           status = CASE WHEN recommendations.status = 'resolved' THEN 'open' ELSE recommendations.status END,
           resolved_at = CASE WHEN recommendations.status = 'resolved' THEN NULL ELSE recommendations.resolved_at END
         RETURNING id, (xmax = 0) AS inserted`,
        [
          s.fingerprint, s.ruleCode, s.kind, s.severity, s.actionType, s.confidence, s.score,
          s.productId, s.productChannelId, s.marketplaceId, s.experimentId,
          s.title, s.issue, JSON.stringify(s.evidence), s.recommendation, s.reason, s.objective,
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
            s.experimentId, s.alert.message, JSON.stringify({ evidence: s.evidence }),
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
    }
    await logAudit(
      { user, action: 'engine.run', entityType: 'recommendations', newValue: result },
      client,
    )
    return result
  })

  return summary
}

import 'server-only'
import { pool } from '@/lib/db'
import { connection } from '@/lib/integrations/mercado-livre'
import { fetchAdvertiser, fetchDailyAdsMetrics } from '@/lib/integrations/meli-ads'
import type { DateRange } from '@/lib/integrations/types'

const MAX_LOOKBACK_DAYS = 89

function clampRange(range: DateRange): DateRange {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const min = new Date(`${today}T12:00:00Z`)
  min.setUTCDate(min.getUTCDate() - MAX_LOOKBACK_DAYS)
  const minIso = min.toISOString().slice(0, 10)
  const from = range.from < minIso ? minIso : range.from
  const to = range.to > today ? today : range.to
  return { from, to: to < from ? from : to }
}

/**
 * Pulls the real daily Product Ads cost and stores it in advertising_metrics under one
 * account-level campaign row. Re-running a period overwrites it (the ML revises recent days).
 */
export async function syncMeliAds(range: DateRange) {
  const window = clampRange(range)
  const conn = await connection()
  const advertiser = await fetchAdvertiser(conn.accessToken)
  const rows = await fetchDailyAdsMetrics(conn.accessToken, advertiser, window)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const campaign = await client.query<{ id: string }>(
      `INSERT INTO advertising_campaigns (marketplace_id, external_id, name, status, raw, updated_at)
       VALUES ($1, $2, 'Product Ads · total da conta', 'active', $3, now())
       ON CONFLICT (marketplace_id, external_id)
         DO UPDATE SET raw = EXCLUDED.raw, updated_at = now()
       RETURNING id`,
      [conn.marketplaceId, `pads-account-${advertiser.advertiserId}`, JSON.stringify(advertiser)],
    )
    const campaignId = campaign.rows[0].id
    for (const r of rows) {
      await client.query(
        `INSERT INTO advertising_metrics
           (campaign_id, product_channel_id, metric_date, impressions, clicks, cost, attributed_sales, indirect_sales,
            attributed_revenue, raw, synced_at)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (campaign_id, COALESCE(product_channel_id, 0), metric_date)
           DO UPDATE SET impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, cost = EXCLUDED.cost,
                         attributed_sales = EXCLUDED.attributed_sales, indirect_sales = EXCLUDED.indirect_sales,
                         attributed_revenue = EXCLUDED.attributed_revenue, raw = EXCLUDED.raw, synced_at = now()`,
        [campaignId, r.date, r.prints, r.clicks, r.cost.toFixed(2), r.directUnits, r.indirectUnits, r.revenue.toFixed(2), JSON.stringify(r)],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  const total = rows.reduce((s, r) => s + r.cost, 0)
  const revenue = rows.reduce((s, r) => s + r.revenue, 0)
  return { window, days: rows.length, total, revenue, roas: total > 0 ? revenue / total : null }
}

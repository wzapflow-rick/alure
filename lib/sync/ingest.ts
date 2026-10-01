import 'server-only'
import type { PoolClient } from 'pg'
import { pool, withTransaction } from '@/lib/db'
import { getAdapter } from '@/lib/integrations/adapters'
import type { DateRange, NormalizedDailyMetric, NormalizedOrder } from '@/lib/integrations/types'

/** Idempotent: re-running a sync for the same range never duplicates data. */
export async function upsertOrder(client: PoolClient, marketplaceId: number, source: string, order: NormalizedOrder) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO orders (marketplace_id, external_id, status, order_date, total_amount, source, raw, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (marketplace_id, external_id) DO UPDATE SET
       status = EXCLUDED.status, total_amount = EXCLUDED.total_amount, raw = EXCLUDED.raw, synced_at = now()
     RETURNING id`,
    [marketplaceId, order.externalId, order.status, order.orderDate, order.totalAmount, source, JSON.stringify(order.raw)],
  )
  const orderId = rows[0].id
  for (const item of order.items) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_channel_id, external_item_id, sku, quantity, unit_price, total)
       SELECT $1, pc.product_id, pc.id, $2, $3, $4, $5, $4 * $5
         FROM (SELECT 1) one
    LEFT JOIN product_channels pc ON pc.marketplace_id = $6 AND pc.external_id = $7
       ON CONFLICT (order_id, external_item_id) DO UPDATE SET
         quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price, total = EXCLUDED.total,
         product_id = EXCLUDED.product_id, product_channel_id = EXCLUDED.product_channel_id`,
      [orderId, item.externalItemId, item.sku, item.quantity, item.unitPrice, marketplaceId, item.externalListingId],
    )
  }
}

export async function upsertDailyMetric(client: PoolClient, marketplaceId: number, source: string, m: NormalizedDailyMetric) {
  const pc = await client.query<{ id: string }>(
    'SELECT id FROM product_channels WHERE marketplace_id = $1 AND external_id = $2',
    [marketplaceId, m.externalListingId],
  )
  const channelId = pc.rows[0]?.id
  if (!channelId) return false

  if (m.orders !== undefined || m.revenue !== undefined) {
    await client.query(
      `INSERT INTO sales_metrics (product_channel_id, metric_date, orders, units, revenue, source, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (product_channel_id, metric_date) DO UPDATE SET
         orders = EXCLUDED.orders, units = EXCLUDED.units, revenue = EXCLUDED.revenue,
         source = EXCLUDED.source, synced_at = now()`,
      [channelId, m.date, m.orders ?? 0, m.units ?? 0, m.revenue ?? 0, source],
    )
  }
  if (m.visits !== undefined) {
    await client.query(
      `INSERT INTO traffic_metrics (product_channel_id, metric_date, visits, source, synced_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (product_channel_id, metric_date) DO UPDATE SET
         visits = EXCLUDED.visits, source = EXCLUDED.source, synced_at = now()`,
      [channelId, m.date, m.visits, source],
    )
  }
  return true
}

/** Runs a sync job with retry-safe bookkeeping in sync_jobs. */
export async function runSync(marketplaceCode: string, range: DateRange) {
  const adapter = getAdapter(marketplaceCode)
  if (!adapter) throw new Error(`Adapter desconhecido: ${marketplaceCode}`)

  const mp = await pool.query<{ id: string }>('SELECT id FROM marketplaces WHERE code = $1', [marketplaceCode])
  const marketplaceId = Number(mp.rows[0]?.id)
  if (!marketplaceId) throw new Error(`Marketplace não cadastrado: ${marketplaceCode}`)

  const job = await pool.query<{ id: string }>(
    `INSERT INTO sync_jobs (marketplace_id, job_type, status, started_at, cursor)
     VALUES ($1, 'orders_and_metrics', 'running', now(), $2) RETURNING id`,
    [marketplaceId, JSON.stringify(range)],
  )
  const jobId = job.rows[0].id

  try {
    const [orders, metrics] = await Promise.all([adapter.fetchOrders(range), adapter.fetchDailyMetrics(range)])
    let processed = 0
    await withTransaction(async (client) => {
      for (const o of orders) {
        await upsertOrder(client, marketplaceId, adapter.code, o)
        processed++
      }
      for (const m of metrics) {
        if (await upsertDailyMetric(client, marketplaceId, adapter.code, m)) processed++
      }
    })
    await pool.query(
      `UPDATE sync_jobs SET status='success', finished_at=now(), records_processed=$2 WHERE id=$1`,
      [jobId, processed],
    )
    return { status: 'success' as const, processed }
  } catch (error) {
    const message = (error as Error).message
    await pool.query(`UPDATE sync_jobs SET status='error', finished_at=now(), error=$2 WHERE id=$1`, [jobId, message])
    return { status: 'error' as const, error: message }
  }
}

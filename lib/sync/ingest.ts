import 'server-only'
import type { PoolClient } from 'pg'
import { pool, withTransaction } from '@/lib/db'
import { getAdapter } from '@/lib/integrations/adapters'
import type { DateRange, NormalizedDailyMetric, NormalizedListing, NormalizedOrder } from '@/lib/integrations/types'

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

/**
 * Links a marketplace listing to an ALURE product by SKU. Listings without a matching SKU
 * are skipped (never auto-creating products). Price changes are recorded in price_history.
 */
export async function upsertListing(client: PoolClient, marketplaceId: number, l: NormalizedListing) {
  const existing = await client.query<{ id: string; current_price: string }>(
    'SELECT id, current_price FROM product_channels WHERE marketplace_id = $1 AND external_id = $2',
    [marketplaceId, l.externalListingId],
  )
  const row = existing.rows[0]

  if (row) {
    await client.query(
      `UPDATE product_channels SET listing_title=$2, listing_url=$3, current_price=$4, status=$5, updated_at=now() WHERE id=$1`,
      [row.id, l.title, l.url, l.price, l.status],
    )
    if (Number(row.current_price) !== l.price) {
      await client.query(
        `INSERT INTO price_history (product_channel_id, previous_price, price, source, reason)
         VALUES ($1,$2,$3,'sync','Preço alterado no marketplace')`,
        [row.id, row.current_price, l.price],
      )
    }
    return true
  }

  if (!l.sku) return false
  const product = await client.query<{ id: string }>('SELECT id FROM products WHERE lower(sku) = lower($1)', [l.sku])
  const productId = product.rows[0]?.id
  if (!productId) return false

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO product_channels (product_id, marketplace_id, external_id, listing_title, listing_url, current_price, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [productId, marketplaceId, l.externalListingId, l.title, l.url, l.price, l.status],
  )
  await client.query(
    `INSERT INTO price_history (product_channel_id, previous_price, price, source, reason)
     VALUES ($1, NULL, $2, 'sync', 'Anúncio vinculado pela sincronização')`,
    [inserted.rows[0].id, l.price],
  )
  return true
}

const PAID_STATUSES = ['paid', 'partially_paid', 'partially_refunded']

/** Recomputes daily sales for the range from paid orders, so cancellations are reflected. */
export async function rebuildSalesFromOrders(client: PoolClient, marketplaceId: number, source: string, range: DateRange) {
  await client.query(
    `UPDATE sales_metrics sm SET orders = 0, units = 0, revenue = 0, synced_at = now()
       FROM product_channels pc
      WHERE sm.product_channel_id = pc.id AND pc.marketplace_id = $1 AND sm.source = $2
        AND sm.metric_date BETWEEN $3 AND $4`,
    [marketplaceId, source, range.from, range.to],
  )
  await client.query(
    `INSERT INTO sales_metrics (product_channel_id, metric_date, orders, units, revenue, source, synced_at)
     SELECT oi.product_channel_id, (o.order_date AT TIME ZONE 'America/Sao_Paulo')::date,
            count(DISTINCT o.id), sum(oi.quantity), sum(oi.total), $2, now()
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id AND oi.product_channel_id IS NOT NULL
      WHERE o.marketplace_id = $1 AND o.status = ANY($5)
        AND (o.order_date AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $3 AND $4
      GROUP BY 1, 2
     ON CONFLICT (product_channel_id, metric_date) DO UPDATE SET
       orders = EXCLUDED.orders, units = EXCLUDED.units, revenue = EXCLUDED.revenue,
       source = EXCLUDED.source, synced_at = now()`,
    [marketplaceId, source, range.from, range.to, PAID_STATUSES],
  )
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
    let processed = 0
    // Listings first: orders and visits resolve to product_channels by external id.
    if (adapter.fetchListings) {
      const listings = await adapter.fetchListings()
      await withTransaction(async (client) => {
        for (const l of listings) {
          if (await upsertListing(client, marketplaceId, l)) processed++
        }
      })
    }

    const [orders, metrics] = await Promise.all([adapter.fetchOrders(range), adapter.fetchDailyMetrics(range)])
    await withTransaction(async (client) => {
      for (const o of orders) {
        await upsertOrder(client, marketplaceId, adapter.code, o)
        processed++
      }
      for (const m of metrics) {
        if (await upsertDailyMetric(client, marketplaceId, adapter.code, m)) processed++
      }
      await rebuildSalesFromOrders(client, marketplaceId, adapter.code, range)
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

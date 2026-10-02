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
       SELECT $1, pc.product_id, pc.id, $2::text, $3::text, $4::int, $5::numeric, $4::int * $5::numeric
         FROM (SELECT 1) one
    LEFT JOIN product_channels pc ON pc.marketplace_id = $6 AND pc.external_id = $7::text
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

/** Stock columns come from migration 005; until it runs, the sync keeps working without them. */
async function saveStock(client: PoolClient, channelId: string, qty: number | null | undefined) {
  if (qty === null || qty === undefined) return
  await client.query('SAVEPOINT save_stock')
  try {
    await client.query('UPDATE product_channels SET available_quantity = $2, stock_synced_at = now() WHERE id = $1', [channelId, Math.max(0, qty)])
    await client.query('RELEASE SAVEPOINT save_stock')
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT save_stock')
    if ((e as { code?: string }).code !== '42703') throw e
  }
}

/**
 * Links a marketplace listing to an ALURE product by SKU. Listings without a matching SKU
 * are skipped (never auto-creating products). Price changes are recorded in price_history.
 */
export async function upsertListing(
  client: PoolClient,
  marketplaceId: number,
  l: NormalizedListing,
  opts: { linkOnly?: boolean } = {},
) {
  const existing = await client.query<{ id: string; current_price: string }>(
    'SELECT id, current_price FROM product_channels WHERE marketplace_id = $1 AND external_id = $2',
    [marketplaceId, l.externalListingId],
  )
  const row = existing.rows[0]

  // Order-derived listings carry a placeholder status/price; they must never overwrite
  // what the listings endpoint just reported (this marked active listings as inactive).
  if (row && opts.linkOnly) return true

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
    await saveStock(client, row.id, l.availableQuantity)
    return true
  }

  // The marketplace is the source of truth for the catalog: unknown listings become products,
  // keyed by the seller SKU (or the listing id when the seller left SKU empty).
  const sku = l.sku?.trim() || `ML-${l.externalListingId}`
  const product = await client.query<{ id: string }>(
    `WITH found AS (SELECT id FROM products WHERE lower(sku) = lower($1) LIMIT 1),
          created AS (
            INSERT INTO products (sku, name)
            SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM found)
            ON CONFLICT (sku) DO NOTHING
            RETURNING id
          )
     SELECT id FROM found UNION ALL SELECT id FROM created`,
    [sku, l.title],
  )
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
  await saveStock(client, inserted.rows[0].id, l.availableQuantity)
  return true
}

type RawOrderItem = { item?: { id?: string; title?: string } }

function listingsFromOrders(orders: NormalizedOrder[]): NormalizedListing[] {
  const byId = new Map<string, NormalizedListing>()
  for (const order of orders) {
    const rawItems = ((order.raw as { order_items?: RawOrderItem[] })?.order_items ?? [])
    for (const item of order.items) {
      if (!item.externalListingId || byId.has(item.externalListingId)) continue
      const title = rawItems.find((r) => r.item?.id === item.externalListingId)?.item?.title
      byId.set(item.externalListingId, {
        externalListingId: item.externalListingId,
        sku: item.sku,
        title: title ?? item.externalListingId,
        url: null,
        price: item.unitPrice,
        status: 'inactive',
      })
    }
  }
  return [...byId.values()]
}

const PAID_STATUSES = ['paid', 'partially_paid', 'partially_refunded']

/** Recomputes daily sales for the range from paid orders, so cancellations are reflected. */
export async function rebuildSalesFromOrders(client: PoolClient, marketplaceId: number, source: string, range: DateRange) {
  // Items saved before their listing existed stay unlinked; resolve them by the listing id
  // embedded in external_item_id ("<listing>:<variation>").
  await client.query(
    `UPDATE order_items oi SET product_channel_id = pc.id, product_id = pc.product_id
       FROM orders o, product_channels pc
      WHERE oi.order_id = o.id AND o.marketplace_id = $1 AND oi.product_channel_id IS NULL
        AND pc.marketplace_id = o.marketplace_id AND pc.external_id = split_part(oi.external_item_id, ':', 1)`,
    [marketplaceId],
  )
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
      const catalogColumn = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'product_channels' AND column_name = 'catalog_listing') AS ok`,
      )
      await withTransaction(async (client) => {
        for (const l of listings) {
          if (await upsertListing(client, marketplaceId, l)) processed++
          if (catalogColumn.rows[0]?.ok && l.catalogListing !== undefined) {
            await client.query(
              `UPDATE product_channels SET catalog_listing = $3, catalog_product_id = $4
                WHERE marketplace_id = $1 AND external_id = $2`,
              [marketplaceId, l.externalListingId, l.catalogListing, l.catalogProductId ?? null],
            )
          }
        }
      })
    }

    let competitionWarning: string | null = null
    if (marketplaceCode === 'mercado_livre') {
      try {
        const { collectCatalogWinners } = await import('@/lib/integrations/meli-competition')
        const result = await collectCatalogWinners(marketplaceId)
        competitionWarning = result.skipped
        await pool.query(`UPDATE sync_jobs SET cursor = cursor || $2::jsonb WHERE id = $1`, [
          jobId,
          JSON.stringify({
            catalogo: {
              verificados: result.checked,
              gravados: result.recorded,
              detalhes: 'details' in result ? result.details : [],
              aviso: result.skipped,
            },
          }),
        ])
      } catch (error) {
        competitionWarning = `Vencedor do catálogo não coletado: ${(error as Error).message}`
      }
    }

    const orders = await adapter.fetchOrders(range)
    // Sold listings may be closed and absent from the listings search; link them from the order itself.
    await withTransaction(async (client) => {
      for (const listing of listingsFromOrders(orders)) {
        await upsertListing(client, marketplaceId, listing, { linkOnly: true })
      }
    })
    // Orders are persisted before traffic so a visits failure never discards sales.
    await withTransaction(async (client) => {
      for (const o of orders) {
        await upsertOrder(client, marketplaceId, adapter.code, o)
        processed++
      }
      await rebuildSalesFromOrders(client, marketplaceId, adapter.code, range)
    })

    let warning: string | null = null
    try {
      const metrics = await adapter.fetchDailyMetrics(range)
      warning = (metrics as { warning?: string }).warning ?? null
      await withTransaction(async (client) => {
        for (const m of metrics) {
          if (await upsertDailyMetric(client, marketplaceId, adapter.code, m)) processed++
        }
        // Metrics may carry sales too; orders stay the source of truth.
        await rebuildSalesFromOrders(client, marketplaceId, adapter.code, range)
      })
    } catch (error) {
      warning = `Pedidos salvos; visitas não sincronizadas: ${(error as Error).message}`
    }
    if (competitionWarning) warning = warning ? `${warning} · ${competitionWarning}` : competitionWarning

    await pool.query(
      `UPDATE sync_jobs SET status='success', finished_at=now(), records_processed=$2, error=$3 WHERE id=$1`,
      [jobId, processed, warning],
    )
    return { status: 'success' as const, processed, warning }
  } catch (error) {
    const message = (error as Error).message
    await pool.query(`UPDATE sync_jobs SET status='error', finished_at=now(), error=$2 WHERE id=$1`, [jobId, message])
    return { status: 'error' as const, error: message }
  }
}

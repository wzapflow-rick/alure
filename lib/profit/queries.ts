import 'server-only'
import { query, queryOne } from '@/lib/db'

export const PAID_STATUSES = ['paid', 'partially_paid', 'partially_refunded']
export const PROFIT_SETTINGS_KEY = 'profit'

export type ProfitSettings = { taxRatePct: number }

export async function getProfitSettings(): Promise<ProfitSettings> {
  const row = await queryOne<{ value: Partial<ProfitSettings> }>('SELECT value FROM app_settings WHERE key = $1', [
    PROFIT_SETTINGS_KEY,
  ])
  const rate = Number(row?.value?.taxRatePct ?? 0)
  return { taxRatePct: Number.isFinite(rate) && rate >= 0 ? rate : 0 }
}

export async function profitSchemaReady() {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'orders' AND column_name = 'shipping_cost_seller')
        AND to_regclass('public.ad_spend_daily') IS NOT NULL AS ok`,
  )
  return Boolean(row?.ok)
}

type ItemRow = {
  order_id: string
  external_order_id: string
  status: string
  day: string
  sku: string | null
  listing_id: string
  name: string | null
  quantity: number
  total: string
  share: string | null
  unit_cost: string | null
  order_fee: string | null
  order_tax: string | null
  buyer_ship: string | null
  seller_ship: string | null
  shipment_id: string | null
  shipping_synced: boolean
}

export type ProfitFilters = { from: string; to: string; q: string; status: 'valid' | 'cancelled' | 'all' }

export type Breakdown = {
  sales: number
  cost: number
  fees: number
  taxes: number
  sellerShip: number
  buyerShip: number
  contribution: number
  units: number
  orders: number
}

export type ProductRow = Breakdown & { key: string; sku: string | null; listingId: string; name: string; missingCost: boolean }
export type DayRow = Breakdown & { day: string }

export type ProfitReport = {
  summary: Breakdown & {
    gross: number
    cancelled: number
    cancelledOrders: number
    ads: number
    adsDays: number
    afterAds: number
    adsApplies: boolean
    shippingPending: number
    itemsWithoutCost: number
  }
  products: ProductRow[]
  days: DayRow[]
  taxRatePct: number
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const emptyBreakdown = (): Breakdown => ({
  sales: 0,
  cost: 0,
  fees: 0,
  taxes: 0,
  sellerShip: 0,
  buyerShip: 0,
  contribution: 0,
  units: 0,
  orders: 0,
})

/**
 * Order-level amounts (ML sale fee, taxes, shipping) are split across the order's items by
 * revenue share, so per-product margins add up to the order totals.
 */
export async function getProfitReport(filters: ProfitFilters, schemaReady: boolean): Promise<ProfitReport> {
  const sellerShip = schemaReady ? 'o.shipping_cost_seller' : 'NULL::numeric'
  const shipmentId = schemaReady ? "COALESCE(o.shipment_id, o.raw->'shipping'->>'id')" : "o.raw->'shipping'->>'id'"
  const synced = schemaReady ? 'o.shipping_synced_at IS NOT NULL' : 'false'

  const [rows, settings] = await Promise.all([
    query<ItemRow>(
      `SELECT o.id AS order_id, o.external_id AS external_order_id, o.status,
              to_char((o.order_date AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS day,
              oi.sku, split_part(oi.external_item_id, ':', 1) AS listing_id,
              COALESCE(p.name, pc.listing_title) AS name,
              oi.quantity, oi.total,
              oi.total / NULLIF(sum(oi.total) OVER (PARTITION BY o.id), 0) AS share,
              pcost.average_cost AS unit_cost,
              CASE WHEN jsonb_typeof(o.raw->'order_items') = 'array' THEN
                (SELECT sum(COALESCE((e->>'sale_fee')::numeric, 0) * COALESCE((e->>'quantity')::numeric, 1))
                   FROM jsonb_array_elements(o.raw->'order_items') e)
              END AS order_fee,
              CASE WHEN jsonb_typeof(o.raw->'taxes') = 'object' THEN (o.raw->'taxes'->>'amount')::numeric END AS order_tax,
              CASE WHEN jsonb_typeof(o.raw->'payments') = 'array' THEN
                (SELECT sum(COALESCE((pay->>'shipping_cost')::numeric, 0))
                   FROM jsonb_array_elements(o.raw->'payments') pay
                  WHERE pay->>'status' = 'approved')
              END AS buyer_ship,
              ${sellerShip} AS seller_ship,
              ${shipmentId} AS shipment_id,
              ${synced} AS shipping_synced
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN product_channels pc ON pc.id = oi.product_channel_id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_costs pcost ON pcost.product_id = oi.product_id AND pcost.active
        WHERE (o.order_date AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2
        ORDER BY o.order_date`,
      [filters.from, filters.to],
    ),
    getProfitSettings(),
  ])

  const terms = normalize(filters.q.trim()).split(/\s+/).filter(Boolean)
  const matches = (r: ItemRow) => {
    if (!terms.length) return true
    const hay = normalize([r.sku, r.listing_id, r.name, r.external_order_id].filter(Boolean).join(' '))
    return terms.every((t) => hay.includes(t))
  }

  const taxRate = settings.taxRatePct / 100
  const summary = { ...emptyBreakdown(), gross: 0, cancelled: 0, cancelledOrders: 0 }
  const products = new Map<string, ProductRow>()
  const days = new Map<string, DayRow>()
  const validOrders = new Set<string>()
  const cancelledOrders = new Set<string>()
  const pendingShipping = new Set<string>()
  let itemsWithoutCost = 0

  for (const r of rows) {
    if (!matches(r)) continue
    const total = n(r.total)
    const isValid = PAID_STATUSES.includes(r.status)
    const isCancelled = r.status === 'cancelled'

    if (isCancelled) {
      summary.cancelled += total
      cancelledOrders.add(r.order_id)
    }
    if (isValid || isCancelled) summary.gross += total

    const include =
      filters.status === 'all' ? isValid || isCancelled : filters.status === 'cancelled' ? isCancelled : isValid
    if (!include) continue
    // Cancelled sales carry no cost: the product returns and ML refunds the fee.
    if (!isValid) continue

    const share = r.share === null ? 1 : n(r.share)
    const cost = r.unit_cost === null ? 0 : n(r.unit_cost) * r.quantity
    if (r.unit_cost === null) itemsWithoutCost++
    const fees = n(r.order_fee) * share
    const taxes = n(r.order_tax) * share + total * taxRate
    const seller = n(r.seller_ship) * share
    const buyer = n(r.buyer_ship) * share
    if (r.shipment_id && !r.shipping_synced) pendingShipping.add(r.order_id)
    validOrders.add(r.order_id)

    const add = (b: Breakdown) => {
      b.sales += total
      b.cost += cost
      b.fees += fees
      b.taxes += taxes
      b.sellerShip += seller
      b.buyerShip += buyer
      b.units += r.quantity
      b.contribution += total - cost - fees - taxes - seller
    }
    add(summary)

    const key = r.sku || r.listing_id
    const product =
      products.get(key) ??
      ({ ...emptyBreakdown(), key, sku: r.sku, listingId: r.listing_id, name: r.name ?? r.listing_id, missingCost: false } as ProductRow)
    add(product)
    product.orders++
    if (r.unit_cost === null) product.missingCost = true
    products.set(key, product)

    const day = days.get(r.day) ?? ({ ...emptyBreakdown(), day: r.day } as DayRow)
    add(day)
    days.set(r.day, day)
  }
  summary.orders = validOrders.size

  const dayOrders = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!matches(r) || !PAID_STATUSES.includes(r.status)) continue
    const set = dayOrders.get(r.day) ?? new Set()
    set.add(r.order_id)
    dayOrders.set(r.day, set)
  }
  for (const [day, set] of dayOrders) {
    const row = days.get(day)
    if (row) row.orders = set.size
  }

  // Ad spend is not attributable per product, so a product search hides it instead of guessing.
  const adsApplies = terms.length === 0 && filters.status !== 'cancelled'
  let ads = 0
  let adsDays = 0
  if (adsApplies) {
    const adRows = await query<{ day: string; amount: string }>(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day, sum(amount) AS amount FROM (
         ${schemaReady ? 'SELECT spend_date AS d, amount FROM ad_spend_daily WHERE spend_date BETWEEN $1 AND $2 UNION ALL' : ''}
         SELECT metric_date AS d, COALESCE(cost, 0) AS amount FROM advertising_metrics WHERE metric_date BETWEEN $1 AND $2
       ) x GROUP BY 1`,
      [filters.from, filters.to],
    )
    for (const a of adRows) {
      const amount = n(a.amount)
      if (amount > 0) adsDays++
      ads += amount
    }
  }

  return {
    summary: {
      ...summary,
      cancelledOrders: cancelledOrders.size,
      ads,
      adsDays,
      afterAds: summary.contribution - ads,
      adsApplies,
      shippingPending: pendingShipping.size,
      itemsWithoutCost,
    },
    products: [...products.values()].sort((a, b) => b.sales - a.sales),
    days: [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    taxRatePct: settings.taxRatePct,
  }
}

import 'server-only'
import { query, queryOne } from '@/lib/db'
import { HAS_MEDIATION, returnsSchemaReady } from '@/lib/profit/returns-schema'

export const PAID_STATUSES = ['paid', 'partially_paid', 'partially_refunded']
export const PROFIT_SETTINGS_KEY = 'profit'

export type ProfitSettings = { taxRatePct: number }

export const DEFAULT_TAX_RATE_PCT = 7

export async function getProfitSettings(): Promise<ProfitSettings> {
  const row = await queryOne<{ value: Partial<ProfitSettings> }>('SELECT value FROM app_settings WHERE key = $1', [
    PROFIT_SETTINGS_KEY,
  ])
  const rate = Number(row?.value?.taxRatePct ?? DEFAULT_TAX_RATE_PCT)
  return { taxRatePct: Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_TAX_RATE_PCT }
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
  refunded: string | null
  order_items_total: string | null
  has_return: boolean
  return_cost: string | null
  return_synced: boolean
}

export type ProfitFilters = { from: string; to: string; q: string; status: 'valid' | 'cancelled' | 'all' }

export type Breakdown = {
  sales: number
  cost: number
  fees: number
  taxes: number
  sellerShip: number
  buyerShip: number
  /** Return shipping charged by ML plus the outgoing shipping of orders that came back. */
  returns: number
  /** Part of the sale refunded to the buyer (already removed from `sales`). */
  refunds: number
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
    returnsPending: number
    returnedOrders: number
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
  returns: 0,
  refunds: 0,
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
  // A shipment read that failed (cost unknown) counts as not synced, so the report flags it.
  const synced = schemaReady ? 'o.shipping_synced_at IS NOT NULL AND o.shipping_error IS NULL' : 'false'
  const returnsReady = await returnsSchemaReady()
  const returnCost = returnsReady ? 'o.return_cost_seller' : 'NULL::numeric'
  const returnSynced = returnsReady ? 'o.return_synced_at IS NOT NULL AND o.return_error IS NULL' : 'false'

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
              ${synced} AS shipping_synced,
              CASE WHEN jsonb_typeof(o.raw->'payments') = 'array' THEN
                (SELECT sum(COALESCE((pay->>'transaction_amount_refunded')::numeric, 0))
                   FROM jsonb_array_elements(o.raw->'payments') pay)
              END AS refunded,
              sum(oi.total) OVER (PARTITION BY o.id) AS order_items_total,
              ${HAS_MEDIATION} AS has_return,
              ${returnCost} AS return_cost,
              ${returnSynced} AS return_synced
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
  const pendingReturns = new Set<string>()
  const returnedOrders = new Set<string>()
  let itemsWithoutCost = 0

  const addTo = (r: ItemRow, apply: (b: Breakdown) => void, countsAsSale: boolean) => {
    apply(summary)
    const key = r.sku || r.listing_id
    const product =
      products.get(key) ??
      ({ ...emptyBreakdown(), key, sku: r.sku, listingId: r.listing_id, name: r.name ?? r.listing_id, missingCost: false } as ProductRow)
    apply(product)
    if (countsAsSale) product.orders++
    if (countsAsSale && r.unit_cost === null) product.missingCost = true
    products.set(key, product)
    const day = days.get(r.day) ?? ({ ...emptyBreakdown(), day: r.day } as DayRow)
    apply(day)
    days.set(r.day, day)
  }

  for (const r of rows) {
    if (!matches(r)) continue
    const total = n(r.total)
    const isValid = PAID_STATUSES.includes(r.status)
    const isCancelled = r.status === 'cancelled'
    const share = r.share === null ? 1 : n(r.share)

    if (isCancelled) {
      summary.cancelled += total
      cancelledOrders.add(r.order_id)
    }
    if (isValid || isCancelled) summary.gross += total

    if (r.has_return) {
      if (!r.return_synced) pendingReturns.add(r.order_id)
      if (r.shipment_id && !r.shipping_synced) pendingShipping.add(r.order_id)
    }

    // A cancelled order that was delivered and came back has no sale, fee or tax (ML refunds them),
    // but the seller still pays the outgoing and the return shipping.
    if (isCancelled) {
      if (!r.has_return || filters.status === 'cancelled') continue
      const returns = (n(r.seller_ship) + n(r.return_cost)) * share
      if (returns <= 0) continue
      returnedOrders.add(r.order_id)
      addTo(r, (b) => {
        b.returns += returns
        b.contribution -= returns
      }, false)
      continue
    }

    const include = filters.status === 'all' || filters.status === 'valid' ? isValid : false
    if (!include) continue

    // Partial refunds: payments[].transaction_amount_refunded, capped at the items total so a
    // refunded shipping charge never reduces product revenue.
    const itemsTotal = n(r.order_items_total)
    const refundedOrder = Math.min(n(r.refunded), itemsTotal)
    const kept = itemsTotal > 0 ? 1 - refundedOrder / itemsTotal : 1
    const refund = total * (1 - kept)
    const sales = total - refund

    // Units sent back return to stock; a refund without a return (e.g. compensation) keeps the cost.
    const fullCost = r.unit_cost === null ? 0 : n(r.unit_cost) * r.quantity
    const cost = r.has_return ? fullCost * kept : fullCost
    if (r.unit_cost === null) itemsWithoutCost++
    // ML refunds its sale fee and the order taxes in proportion to the amount refunded.
    const fees = n(r.order_fee) * share * kept
    const taxes = (n(r.order_tax) * share + total * taxRate) * kept
    const seller = n(r.seller_ship) * share
    const buyer = n(r.buyer_ship) * share
    const returns = n(r.return_cost) * share
    if (returns > 0) returnedOrders.add(r.order_id)
    if (r.shipment_id && !r.shipping_synced) pendingShipping.add(r.order_id)
    validOrders.add(r.order_id)

    addTo(r, (b) => {
      b.sales += sales
      b.refunds += refund
      b.cost += cost
      b.fees += fees
      b.taxes += taxes
      b.sellerShip += seller
      b.buyerShip += buyer
      b.returns += returns
      b.units += r.quantity
      b.contribution += sales - cost - fees - taxes - seller - returns
    }, true)
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
         ${
           schemaReady
             ? `SELECT a.spend_date AS d, a.amount FROM ad_spend_daily a
                 WHERE a.spend_date BETWEEN $1 AND $2
                   AND NOT EXISTS (SELECT 1 FROM advertising_metrics m WHERE m.metric_date = a.spend_date)
                UNION ALL`
             : ''
         }
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
      returnsPending: pendingReturns.size,
      returnedOrders: returnedOrders.size,
      itemsWithoutCost,
    },
    products: [...products.values()].sort((a, b) => b.sales - a.sales),
    days: [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    taxRatePct: settings.taxRatePct,
  }
}

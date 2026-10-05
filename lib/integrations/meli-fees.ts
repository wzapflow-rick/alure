import 'server-only'
import { pool } from '@/lib/db'
import { apiGetRaw, connection, type RawCall } from '@/lib/integrations/mercado-livre'

const BATCH_LIMIT = 400
const TIME_BUDGET_MS = 60_000
const CONCURRENCY = 4

type ChannelRow = {
  id: string
  external_id: string
  current_price: string
  listing_type_id: string
  ml_category_id: string
  logistic_type: string | null
  free_shipping: boolean | null
}

type SaleFee = { pct: number; fixed: number }

const ok = (c: RawCall) => c.status >= 200 && c.status < 300
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

/** Sale fee for one price/category/listing type, from /sites/MLB/listing_prices. */
async function quoteSaleFee(ch: ChannelRow, price: number, token: string, cache: Map<string, Promise<SaleFee | string>>) {
  const key = `${ch.ml_category_id}|${ch.listing_type_id}|${ch.logistic_type ?? ''}|${price}`
  let pending = cache.get(key)
  if (!pending) {
    pending = (async () => {
      const params = new URLSearchParams({
        price: String(price),
        listing_type_id: ch.listing_type_id,
        category_id: ch.ml_category_id,
      })
      if (ch.logistic_type) params.set('logistic_type', ch.logistic_type)
      const call = await apiGetRaw(`/sites/MLB/listing_prices?${params}`, token)
      if (!ok(call)) return `listing_prices HTTP ${call.status}`
      const body = call.body as Record<string, any> | Record<string, any>[]
      const pick = Array.isArray(body) ? body.find((b) => b?.listing_type_id === ch.listing_type_id) : body
      const amount = num(pick?.sale_fee_amount)
      const fixed = num(pick?.sale_fee_details?.fixed_fee) ?? 0
      // Derive the rate from the charged amount so it always matches what ML actually bills.
      const pct =
        amount !== null && price > 0 ? ((amount - fixed) / price) * 100 : num(pick?.sale_fee_details?.percentage_fee)
      if (pct === null) return 'listing_prices sem sale_fee_amount'
      return { pct: round(pct, 3), fixed: round(fixed, 2) }
    })()
    cache.set(key, pending)
  }
  return pending
}

/** Seller-paid shipping (already with reputation discount) for free-shipping listings. */
async function quoteShipping(ch: ChannelRow, sellerId: string, token: string): Promise<number | string> {
  if (!ch.free_shipping) return 0
  const call = await apiGetRaw(`/users/${sellerId}/shipping_options/free?item_id=${encodeURIComponent(ch.external_id)}`, token)
  if (!ok(call)) return `shipping_options HTTP ${call.status}`
  const cost = num((call.body as Record<string, any>)?.coverage?.all_country?.list_cost)
  return cost === null ? 'shipping_options sem list_cost' : round(cost, 2)
}

/**
 * Refreshes the real per-listing ML costs (sale fee + shipping). Only stale listings are read:
 * never synced, older than 20h, or whose price changed since the last quote.
 */
export async function collectListingFees(marketplaceId: number) {
  const ready = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'product_channels' AND column_name = 'sale_fee_pct') AS ok`,
  )
  if (!ready.rows[0]?.ok) return { checked: 0, updated: 0, errors: [] as string[], skipped: 'Rode o db/011 para gravar as tarifas reais.' }

  const conn = await connection()
  const { rows } = await pool.query<ChannelRow>(
    `SELECT id, external_id, current_price, listing_type_id, ml_category_id, logistic_type, free_shipping
       FROM product_channels
      WHERE marketplace_id = $1 AND status = 'active' AND external_id IS NOT NULL
        AND listing_type_id IS NOT NULL AND ml_category_id IS NOT NULL
        AND (fees_synced_at IS NULL OR fees_synced_at < now() - interval '20 hours'
             OR fees_price IS DISTINCT FROM current_price)
      ORDER BY fees_synced_at NULLS FIRST
      LIMIT $2`,
    [marketplaceId, BATCH_LIMIT],
  )

  const started = Date.now()
  const cache = new Map<string, Promise<SaleFee | string>>()
  const errors: string[] = []
  let updated = 0
  let checked = 0
  let next = 0

  async function worker() {
    while (next < rows.length && Date.now() - started < TIME_BUDGET_MS) {
      const ch = rows[next++]
      checked++
      const price = Number(ch.current_price)
      const [fee, shipping] = await Promise.all([
        quoteSaleFee(ch, price, conn.accessToken, cache),
        quoteShipping(ch, conn.externalAccountId, conn.accessToken),
      ])
      const problems = [typeof fee === 'string' ? fee : null, typeof shipping === 'string' ? shipping : null].filter(Boolean)
      if (problems.length) errors.push(`${ch.external_id}: ${problems.join(' · ')}`)
      await pool.query(
        `UPDATE product_channels
            SET sale_fee_pct   = COALESCE($2, sale_fee_pct),
                sale_fee_fixed = COALESCE($3, sale_fee_fixed),
                shipping_cost  = COALESCE($4, shipping_cost),
                fees_price     = $5,
                fees_synced_at = now(),
                fees_error     = $6
          WHERE id = $1`,
        [
          ch.id,
          typeof fee === 'string' ? null : fee.pct,
          typeof fee === 'string' ? null : fee.fixed,
          typeof shipping === 'string' ? null : shipping,
          price,
          problems.length ? problems.join(' · ') : null,
        ],
      )
      if (typeof fee !== 'string') updated++
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return {
    checked,
    updated,
    errors: errors.slice(0, 20),
    skipped: checked < rows.length ? `Tempo esgotado: ${rows.length - checked} anúncio(s) ficam para a próxima sincronização.` : null,
  }
}

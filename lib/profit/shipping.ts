import 'server-only'
import { pool } from '@/lib/db'
import { apiGetRaw, connection } from '@/lib/integrations/mercado-livre'
import { PAID_STATUSES, profitSchemaReady } from '@/lib/profit/queries'

const DELAY_MS = 120
const TIME_BUDGET_MS = 45_000

type ShipmentCosts = {
  senders?: { cost?: number | null; user_id?: number | null }[]
  receiver?: { cost?: number | null }
}

/**
 * Reads what the seller actually paid for each shipment (GET /shipments/{id}/costs).
 * Only paid orders not yet read are fetched; stops on a time budget so it fits a request.
 */
export async function syncSellerShipping(range?: { from: string; to: string }, limit = 200) {
  if (!(await profitSchemaReady())) return { checked: 0, updated: 0, errors: ['Rode o db/015 para gravar o frete.'] }

  await pool.query(
    `UPDATE orders SET shipment_id = raw->'shipping'->>'id'
      WHERE shipment_id IS NULL AND raw->'shipping'->>'id' IS NOT NULL`,
  )

  const params: unknown[] = [PAID_STATUSES, limit]
  let where = ''
  if (range) {
    params.push(range.from, range.to)
    where = `AND (o.order_date AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $3 AND $4`
  }
  const { rows } = await pool.query<{ id: string; shipment_id: string }>(
    `SELECT o.id, o.shipment_id
       FROM orders o
       JOIN marketplaces m ON m.id = o.marketplace_id AND m.code = 'mercado_livre'
      WHERE o.shipment_id IS NOT NULL AND o.shipping_synced_at IS NULL AND o.status = ANY($1) ${where}
      ORDER BY o.order_date DESC
      LIMIT $2`,
    params,
  )
  if (!rows.length) return { checked: 0, updated: 0, errors: [] as string[] }

  const conn = await connection()
  const started = Date.now()
  const errors: string[] = []
  let updated = 0
  let checked = 0

  for (const row of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break
    checked++
    const res = await apiGetRaw(`/shipments/${encodeURIComponent(row.shipment_id)}/costs`, conn.accessToken)
    if (res.status !== 200) {
      const message = `HTTP ${res.status}`
      errors.push(`${row.shipment_id}: ${message}`)
      // 404/403 never resolve on retry; mark as read with zero so the report stops waiting on it.
      if (res.status === 404 || res.status === 403) {
        await pool.query(
          `UPDATE orders SET shipping_cost_seller = 0, shipping_synced_at = now(), shipping_error = $2 WHERE id = $1`,
          [row.id, message],
        )
      }
      continue
    }
    const body = res.body as ShipmentCosts
    const senders = Array.isArray(body?.senders) ? body.senders : []
    const own = senders.filter((s) => !s.user_id || String(s.user_id) === String(conn.externalAccountId))
    const cost = (own.length ? own : senders).reduce((sum, s) => sum + (Number(s.cost) || 0), 0)
    await pool.query(
      `UPDATE orders SET shipping_cost_seller = $2, shipping_synced_at = now(), shipping_error = NULL WHERE id = $1`,
      [row.id, Math.round(cost * 100) / 100],
    )
    updated++
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }
  return { checked, updated, errors }
}

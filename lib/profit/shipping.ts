import 'server-only'
import { pool } from '@/lib/db'
import { apiGetRaw, connection } from '@/lib/integrations/mercado-livre'
import { PAID_STATUSES, profitSchemaReady } from '@/lib/profit/queries'
import { HAS_MEDIATION, returnsSchemaReady } from '@/lib/profit/returns-schema'

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
      WHERE o.shipment_id IS NOT NULL AND o.shipping_synced_at IS NULL
        AND (o.status = ANY($1) OR (o.status = 'cancelled' AND ${HAS_MEDIATION})) ${where}
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
      // 404/403 never resolve on retry. The cost stays unknown (not zero) so the report flags it
      // instead of silently inflating the margin.
      if (res.status === 404 || res.status === 403) {
        await pool.query(
          `UPDATE orders SET shipping_cost_seller = NULL, shipping_synced_at = now(), shipping_error = $2 WHERE id = $1`,
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

type ReturnCost = { amount?: number | null }

/**
 * Reads what ML charged for each return (GET /post-purchase/v1/claims/{id}/charges/return-cost).
 * Open returns are re-read daily for 60 days, because the charge only settles when the return closes.
 */
export async function syncReturnCosts(range?: { from: string; to: string }, limit = 200) {
  if (!(await returnsSchemaReady())) return { checked: 0, updated: 0, errors: ['Rode o db/026 para gravar as devoluções.'] }

  const params: unknown[] = [limit]
  let where = ''
  if (range) {
    params.push(range.from, range.to)
    where = `AND (o.order_date AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3`
  }
  const { rows } = await pool.query<{ id: string; claims: string[] }>(
    `SELECT o.id, ARRAY(SELECT m->>'id' FROM jsonb_array_elements(o.raw->'mediations') m WHERE m->>'id' IS NOT NULL) AS claims
       FROM orders o
       JOIN marketplaces mp ON mp.id = o.marketplace_id AND mp.code = 'mercado_livre'
      WHERE ${HAS_MEDIATION}
        AND (o.return_synced_at IS NULL
             OR (o.return_synced_at < now() - interval '1 day' AND o.order_date > now() - interval '60 days'))
        ${where}
      ORDER BY o.return_synced_at NULLS FIRST, o.order_date DESC
      LIMIT $1`,
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
    let total = 0
    let failed: string | null = null
    for (const claim of row.claims) {
      const res = await apiGetRaw(`/post-purchase/v1/claims/${encodeURIComponent(claim)}/charges/return-cost`, conn.accessToken)
      await new Promise((r) => setTimeout(r, DELAY_MS))
      // 404: the claim has no return shipment (e.g. resolved without sending the product back).
      if (res.status === 404) continue
      if (res.status !== 200) {
        failed = `HTTP ${res.status}`
        break
      }
      total += Number((res.body as ReturnCost)?.amount) || 0
    }
    if (failed) {
      errors.push(`${row.id}: ${failed}`)
      await pool.query(`UPDATE orders SET return_synced_at = now(), return_error = $2 WHERE id = $1`, [row.id, failed])
      continue
    }
    await pool.query(
      `UPDATE orders SET return_cost_seller = $2, return_synced_at = now(), return_error = NULL WHERE id = $1`,
      [row.id, Math.round(total * 100) / 100],
    )
    updated++
  }
  return { checked, updated, errors }
}

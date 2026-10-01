import 'server-only'
import type { PoolClient } from 'pg'
import { weightedAverageCost } from '@/lib/pricing/engine'

/** Recomputes product_costs from active cost lots (weighted average). */
export async function recomputeProductCost(client: PoolClient, productId: number) {
  const { rows } = await client.query<{
    quantity: number
    unit_cost: string
    effective_date: string
    supplier: string | null
    notes: string | null
  }>(
    `SELECT quantity, unit_cost, to_char(effective_date,'YYYY-MM-DD') AS effective_date, supplier, notes
       FROM product_cost_history
      WHERE product_id = $1 AND active
      ORDER BY effective_date DESC, id DESC`,
    [productId],
  )

  if (rows.length === 0) {
    await client.query('DELETE FROM product_costs WHERE product_id = $1', [productId])
    return null
  }

  const average = weightedAverageCost(
    rows.map((r) => ({ quantity: Number(r.quantity), unitCost: Number(r.unit_cost) })),
  )
  const latest = rows[0]

  await client.query(
    `INSERT INTO product_costs (product_id, acquisition_cost, average_cost, cost_effective_date, supplier, notes, active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, now())
     ON CONFLICT (product_id) DO UPDATE SET
       acquisition_cost = EXCLUDED.acquisition_cost,
       average_cost = EXCLUDED.average_cost,
       cost_effective_date = EXCLUDED.cost_effective_date,
       supplier = EXCLUDED.supplier,
       notes = EXCLUDED.notes,
       active = true,
       updated_at = now()`,
    [productId, latest.unit_cost, average, latest.effective_date, latest.supplier, latest.notes],
  )
  return average
}

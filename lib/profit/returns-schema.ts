import 'server-only'
import { queryOne } from '@/lib/db'

/** A cancelled order with a mediation was delivered and came back; one without never shipped. */
export const HAS_MEDIATION = `(jsonb_typeof(o.raw->'mediations') = 'array' AND jsonb_array_length(o.raw->'mediations') > 0)`

export async function returnsSchemaReady() {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'orders' AND column_name = 'return_cost_seller') AS ok`,
  )
  return Boolean(row?.ok)
}

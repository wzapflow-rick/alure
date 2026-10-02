'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { authed, failure, formObject, isoDate, optionalText, type ActionState } from '@/lib/actions/shared'

const triState = z
  .enum(['', 'true', 'false'])
  .optional()
  .transform((v) => (v === 'true' ? true : v === 'false' ? false : null))

const offerSchema = z.object({
  productId: z.coerce.number().int().positive(),
  productChannelId: z.coerce.number().int().positive(),
  competitorName: z.string().trim().min(1, 'Informe o concorrente').max(120),
  price: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/\./g, '').replace(',', '.')))
    .refine((v) => Number.isFinite(v) && v > 0 && v < 1_000_000, 'Preço inválido'),
  freeShipping: triState,
  isFull: triState,
  soldQuantity: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0), 'Quantidade vendida inválida'),
  observedOn: isoDate,
  source: z.string().trim().min(1).max(60).default('manual'),
  url: optionalText.refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), 'URL inválida'),
  notes: optionalText,
})

export async function addCompetitorOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = offerSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const owner = await client.query('SELECT 1 FROM product_channels WHERE id = $1 AND product_id = $2', [
        input.productChannelId,
        input.productId,
      ])
      if (!owner.rowCount) throw new Error('not found')
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO competitor_offers
           (product_channel_id, competitor_name, price, free_shipping, is_full, sold_quantity, observed_on, source, url, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          input.productChannelId, input.competitorName, input.price, input.freeShipping, input.isFull,
          input.soldQuantity, input.observedOn, input.source, input.url, input.notes, user.id,
        ],
      )
      await logAudit({ user, action: 'competitor_offer.create', entityType: 'competitor_offers', entityId: rows[0].id, newValue: input }, client)
    })
    revalidatePath(`/produtos/${input.productId}`)
    return { ok: true, message: 'Observação registrada. Entra na próxima análise do motor.' }
  } catch (e) {
    return failure(e)
  }
}

export async function deleteCompetitorOffer(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = z
      .object({ id: z.coerce.number().int().positive(), productId: z.coerce.number().int().positive() })
      .parse(formObject(formData))
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `DELETE FROM competitor_offers co USING product_channels pc
          WHERE co.id = $1 AND pc.id = co.product_channel_id AND pc.product_id = $2
        RETURNING co.*`,
        [input.id, input.productId],
      )
      if (!rows[0]) throw new Error('not found')
      await logAudit({ user, action: 'competitor_offer.delete', entityType: 'competitor_offers', entityId: input.id, oldValue: rows[0] }, client)
    })
    revalidatePath(`/produtos/${input.productId}`)
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

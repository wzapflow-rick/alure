'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { recomputeProductCost } from '@/lib/costs'
import {
  authed,
  failure,
  formObject,
  isoDate,
  money,
  optionalNumber,
  optionalText,
  type ActionState,
} from '@/lib/actions/shared'

const CLASSIFICATIONS = ['motor_de_giro', 'produto_de_margem', 'alto_ticket', 'em_teste', 'sazonal', 'observacao', 'sem_classificacao'] as const

const productSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  sku: z.string().trim().min(1, 'Informe o SKU').max(64),
  name: z.string().trim().min(2, 'Informe o nome').max(200),
  brand: z.string().trim().min(1).max(80).default('Deca'),
  category: optionalText,
  classification: z.enum(CLASSIFICATIONS),
  classificationReason: optionalText,
  notes: optionalText,
  active: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
})

export async function saveProduct(_: ActionState, formData: FormData): Promise<ActionState> {
  let newId: string | null = null
  try {
    const user = await authed()
    const input = productSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      if (input.id) {
        const old = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [input.id])
        if (!old.rows[0]) throw new Error('not found')
        await client.query(
          `UPDATE products SET sku=$2, name=$3, brand=$4, category=$5, classification=$6,
                  classification_reason=$7, notes=$8, active=$9, updated_at=now() WHERE id=$1`,
          [input.id, input.sku, input.name, input.brand, input.category, input.classification, input.classificationReason, input.notes, input.active],
        )
        await logAudit(
          { user, action: 'product.update', entityType: 'products', entityId: input.id, oldValue: old.rows[0], newValue: input },
          client,
        )
      } else {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO products (sku, name, brand, category, classification, classification_reason, notes, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [input.sku, input.name, input.brand, input.category, input.classification, input.classificationReason, input.notes, input.active],
        )
        newId = rows[0].id
        await logAudit({ user, action: 'product.create', entityType: 'products', entityId: newId, newValue: input }, client)
      }
    })
    revalidatePath('/produtos', 'layout')
  } catch (e) {
    return failure(e)
  }
  if (newId) redirect(`/produtos/${newId}`)
  return { ok: true, message: 'Produto salvo.' }
}

const channelSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive(),
  marketplaceId: z.coerce.number().int().positive(),
  externalId: optionalText,
  listingTitle: optionalText,
  currentPrice: money,
  adsCostPct: money,
  sellerDiscount: money,
  status: z.enum(['active', 'paused', 'inactive']),
  reason: optionalText,
})

export async function saveChannel(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = channelSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      if (input.id) {
        const old = await client.query<{ current_price: string; product_id: string }>(
          'SELECT * FROM product_channels WHERE id = $1 FOR UPDATE',
          [input.id],
        )
        const prev = old.rows[0]
        if (!prev || Number(prev.product_id) !== input.productId) throw new Error('not found')
        await client.query(
          `UPDATE product_channels SET external_id=$2, listing_title=$3, current_price=$4, ads_cost_pct=$5,
                  seller_discount=$6, status=$7, updated_at=now() WHERE id=$1`,
          [input.id, input.externalId, input.listingTitle, input.currentPrice, input.adsCostPct, input.sellerDiscount, input.status],
        )
        if (Number(prev.current_price) !== input.currentPrice) {
          await client.query(
            `INSERT INTO price_history (product_channel_id, previous_price, price, source, reason, changed_by)
             VALUES ($1,$2,$3,'manual',$4,$5)`,
            [input.id, prev.current_price, input.currentPrice, input.reason, user.id],
          )
        }
        await logAudit(
          { user, action: 'channel.update', entityType: 'product_channels', entityId: input.id, oldValue: prev, newValue: input, reason: input.reason },
          client,
        )
      } else {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO product_channels (product_id, marketplace_id, external_id, listing_title, current_price, ads_cost_pct, seller_discount, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [input.productId, input.marketplaceId, input.externalId, input.listingTitle, input.currentPrice, input.adsCostPct, input.sellerDiscount, input.status],
        )
        await client.query(
          `INSERT INTO price_history (product_channel_id, previous_price, price, source, reason, changed_by)
           VALUES ($1, NULL, $2, 'manual', 'Cadastro inicial', $3)`,
          [rows[0].id, input.currentPrice, user.id],
        )
        await logAudit({ user, action: 'channel.create', entityType: 'product_channels', entityId: rows[0].id, newValue: input }, client)
      }
    })
    revalidatePath(`/produtos/${input.productId}`)
    return { ok: true, message: 'Canal salvo.' }
  } catch (e) {
    return failure(e)
  }
}

const costLotSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive('Quantidade deve ser maior que zero'),
  unitCost: money,
  effectiveDate: isoDate,
  supplier: optionalText,
  notes: optionalText,
})

export async function addCostLot(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = costLotSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO product_cost_history (product_id, quantity, unit_cost, effective_date, supplier, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.productId, input.quantity, input.unitCost, input.effectiveDate, input.supplier, input.notes, user.id],
      )
      const avg = await recomputeProductCost(client, input.productId)
      await logAudit(
        { user, action: 'cost.add_lot', entityType: 'product_cost_history', entityId: rows[0].id, newValue: { ...input, newAverage: avg } },
        client,
      )
    })
    revalidatePath(`/produtos/${input.productId}`)
    return { ok: true, message: 'Lote adicionado e custo médio recalculado.' }
  } catch (e) {
    return failure(e)
  }
}

const toggleLotSchema = z.object({
  id: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  active: z.enum(['true', 'false']).transform((v) => v === 'true'),
})

export async function toggleCostLot(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = toggleLotSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      await client.query('UPDATE product_cost_history SET active = $3 WHERE id = $1 AND product_id = $2', [input.id, input.productId, input.active])
      const avg = await recomputeProductCost(client, input.productId)
      await logAudit(
        { user, action: input.active ? 'cost.reactivate_lot' : 'cost.deactivate_lot', entityType: 'product_cost_history', entityId: input.id, newValue: { newAverage: avg } },
        client,
      )
    })
    revalidatePath(`/produtos/${input.productId}`)
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

const feeRuleSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    marketplaceId: z.coerce.number().int().positive(),
    name: z.string().trim().min(2, 'Informe o nome da regra').max(120),
    percentageFee: money,
    fixedFee: money,
    additionalFeePct: money,
    additionalFixedFee: money,
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    category: optionalText,
    effectiveFrom: isoDate,
    effectiveTo: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    notes: optionalText,
  })
  .refine((v) => v.minPrice === null || v.maxPrice === null || v.maxPrice >= v.minPrice, 'Preço máximo menor que o mínimo')

export async function saveFeeRule(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = feeRuleSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const params = [
        input.marketplaceId, input.name, input.percentageFee, input.fixedFee, input.additionalFeePct,
        input.additionalFixedFee, input.minPrice, input.maxPrice, input.category, input.effectiveFrom,
        input.effectiveTo, input.notes,
      ]
      if (input.id) {
        const old = await client.query('SELECT * FROM fee_rules WHERE id = $1', [input.id])
        await client.query(
          `UPDATE fee_rules SET marketplace_id=$2, name=$3, percentage_fee=$4, fixed_fee=$5, additional_fee_pct=$6,
                  additional_fixed_fee=$7, min_price=$8, max_price=$9, category=$10, effective_from=$11,
                  effective_to=$12, notes=$13, updated_at=now() WHERE id=$1`,
          [input.id, ...params],
        )
        await logAudit({ user, action: 'fee_rule.update', entityType: 'fee_rules', entityId: input.id, oldValue: old.rows[0], newValue: input }, client)
      } else {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO fee_rules (marketplace_id, name, percentage_fee, fixed_fee, additional_fee_pct, additional_fixed_fee,
                                  min_price, max_price, category, effective_from, effective_to, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [...params, user.id],
        )
        await logAudit({ user, action: 'fee_rule.create', entityType: 'fee_rules', entityId: rows[0].id, newValue: input }, client)
      }
    })
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Regra de taxa salva.' }
  } catch (e) {
    return failure(e)
  }
}

export async function toggleFeeRule(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = z
      .object({ id: z.coerce.number().int().positive(), active: z.enum(['true', 'false']).transform((v) => v === 'true') })
      .parse(formObject(formData))
    await withTransaction(async (client) => {
      await client.query('UPDATE fee_rules SET active = $2, updated_at = now() WHERE id = $1', [input.id, input.active])
      await logAudit({ user, action: input.active ? 'fee_rule.activate' : 'fee_rule.deactivate', entityType: 'fee_rules', entityId: input.id }, client)
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { normalizePhone } from '@/lib/catalog/order-message'
import { deliverCatalogOrder } from '@/lib/catalog/delivery'
import { MAX_LINES, MAX_QTY_PER_ITEM, type OrderLine } from '@/lib/catalog/types'

const orderSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  phone: z.string().trim().min(8, 'Informe seu WhatsApp.').max(30),
  company: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  city: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
  website: z.string().max(0).optional(),
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        qty: z.number().int('Quantidade inválida.').min(1).max(MAX_QTY_PER_ITEM, `Máximo de ${MAX_QTY_PER_ITEM} unidades por item.`),
      }),
    )
    .min(1, 'Seu carrinho está vazio.')
    .max(MAX_LINES),
})

export type SubmitOrderInput = z.input<typeof orderSchema>
export type SubmitOrderResult = { ok: true; code: string } | { ok: false; message: string }

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function orderCode() {
  const bytes = randomBytes(5)
  return `ALR-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`
}

export async function submitCatalogOrder(raw: SubmitOrderInput): Promise<SubmitOrderResult> {
  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) {
    // Bots fill the hidden field; answer like a success so they don't retry.
    if (parsed.error.issues.some((i) => i.path[0] === 'website')) return { ok: true, code: orderCode() }
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const input = parsed.data
  const phone = normalizePhone(input.phone)
  if (!phone) return { ok: false, message: 'WhatsApp inválido. Use DDD + número.' }

  try {
    const recent = await queryOne<{ by_phone: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE customer_phone = $1)::int AS by_phone, COUNT(*)::int AS total
         FROM catalog_orders WHERE created_at > now() - interval '10 minutes'`,
      [phone],
    )
    if ((recent?.by_phone ?? 0) >= 3 || (recent?.total ?? 0) >= 40) {
      return { ok: false, message: 'Recebemos vários pedidos seguidos. Aguarde alguns minutos ou fale com a gente no WhatsApp.' }
    }

    const qtyById = new Map<number, number>()
    for (const line of input.items) qtyById.set(line.id, (qtyById.get(line.id) ?? 0) + line.qty)
    for (const qty of qtyById.values()) {
      if (qty > MAX_QTY_PER_ITEM) return { ok: false, message: `Máximo de ${MAX_QTY_PER_ITEM} unidades por item.` }
    }

    const rows = await query<{ id: string; sku: string; name: string; price: string }>(
      `SELECT id, sku, name, price FROM catalog_items WHERE published AND id = ANY($1::bigint[])`,
      [[...qtyById.keys()]],
    )
    if (rows.length !== qtyById.size) {
      return { ok: false, message: 'Algum produto do carrinho saiu do catálogo. Atualize a página e revise o pedido.' }
    }

    const items: OrderLine[] = rows.map((r) => {
      const qty = qtyById.get(Number(r.id)) ?? 0
      const unitPrice = Number(r.price)
      return { id: Number(r.id), sku: r.sku, name: r.name, qty, unitPrice, lineTotal: Math.round(unitPrice * qty * 100) / 100 }
    })
    const total = Math.round(items.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100

    let created: { id: string; code: string } | null = null
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      created = await queryOne<{ id: string; code: string }>(
        `INSERT INTO catalog_orders (code, customer_name, customer_phone, customer_company, customer_city, notes, items, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (code) DO NOTHING
         RETURNING id, code`,
        [orderCode(), input.name, phone, input.company, input.city, input.notes, JSON.stringify(items), total],
      )
    }
    if (!created) throw new Error('could not allocate order code')

    await deliverCatalogOrder(Number(created.id))
    revalidatePath('/venda-direta/pedidos')
    return { ok: true, code: created.code }
  } catch (error) {
    console.error('[alure] catalog order failed:', error)
    return { ok: false, message: 'Não foi possível enviar o pedido agora. Tente novamente em instantes.' }
  }
}

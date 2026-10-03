import 'server-only'
import { query, queryOne } from '@/lib/db'
import { sendCatalogOrderText } from '@/lib/notify/evolution'
import { buildOrderMessage } from '@/lib/catalog/order-message'
import type { OrderLine } from '@/lib/catalog/types'

function panelUrl() {
  const base =
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  return base ? `${base.replace(/\/+$/, '')}/venda-direta/pedidos` : null
}

type StoredOrder = {
  code: string
  customer_name: string
  customer_phone: string
  customer_company: string | null
  customer_city: string | null
  notes: string | null
  items: OrderLine[]
  total: string
}

/** Sends the order to the ALURE WhatsApp and records the outcome; never throws. */
export async function deliverCatalogOrder(id: number): Promise<{ ok: boolean; error?: string }> {
  const order = await queryOne<StoredOrder>(
    `SELECT code, customer_name, customer_phone, customer_company, customer_city, notes, items, total
       FROM catalog_orders WHERE id = $1`,
    [id],
  )
  if (!order) return { ok: false, error: 'Pedido não encontrado.' }

  const text = buildOrderMessage({
    code: order.code,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerCompany: order.customer_company,
    customerCity: order.customer_city,
    notes: order.notes,
    items: order.items,
    total: Number(order.total),
    panelUrl: panelUrl(),
  })

  try {
    await sendCatalogOrderText(text)
    await query(`UPDATE catalog_orders SET whatsapp_status = 'sent', whatsapp_error = NULL, updated_at = now() WHERE id = $1`, [id])
    return { ok: true }
  } catch (error) {
    const message = ((error as Error)?.message ?? 'Falha no envio').slice(0, 500)
    console.error('[alure] catalog order whatsapp failed:', message)
    await query(`UPDATE catalog_orders SET whatsapp_status = 'failed', whatsapp_error = $2, updated_at = now() WHERE id = $1`, [
      id,
      message,
    ]).catch(() => {})
    return { ok: false, error: message }
  }
}

export const resendCatalogOrder = deliverCatalogOrder

import type { OrderLine } from '@/lib/catalog/types'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 13 ? digits : null
}

export function formatPhone(digits: string) {
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return digits
}

export type OrderMessageInput = {
  code: string
  customerName: string
  customerPhone: string
  customerCompany: string | null
  customerCity: string | null
  notes: string | null
  items: OrderLine[]
  total: number
  panelUrl: string | null
}

export function buildOrderMessage(order: OrderMessageInput) {
  const units = order.items.reduce((sum, l) => sum + l.qty, 0)
  const lines = [
    `*Novo pedido do catálogo* · ${order.code}`,
    '',
    `*Cliente:* ${order.customerName}`,
    `*WhatsApp:* ${formatPhone(order.customerPhone)} · wa.me/${order.customerPhone}`,
    order.customerCompany ? `*Empresa/Escritório:* ${order.customerCompany}` : null,
    order.customerCity ? `*Cidade:* ${order.customerCity}` : null,
    '',
    `*Itens (${units} ${units === 1 ? 'unidade' : 'unidades'})*`,
    ...order.items.map(
      (l) => `• ${l.qty}x ${l.name}\n   SKU ${l.sku} · ${brl.format(l.unitPrice)} un · ${brl.format(l.lineTotal)}`,
    ),
    '',
    `*Total: ${brl.format(order.total)}*`,
    order.notes ? `\n*Observações:* ${order.notes}` : null,
    order.panelUrl ? `\nPainel: ${order.panelUrl}` : null,
  ]
  return lines.filter((l) => l !== null).join('\n')
}

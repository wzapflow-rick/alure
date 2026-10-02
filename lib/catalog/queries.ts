import 'server-only'
import { query, queryOne } from '@/lib/db'
import type { CatalogAdminItem, CatalogItem, CatalogOrder, OrderLine, OrderStatus } from '@/lib/catalog/types'

type ItemRow = {
  id: string
  product_id: string | null
  sku: string
  name: string
  description: string | null
  category: string | null
  finish: string | null
  price: string
  compare_at_price: string | null
  images: string[] | null
  published: boolean
  sort_order: number
}

const ITEM_COLUMNS = `id, product_id, sku, name, description, category, finish, price, compare_at_price,
                      images, published, sort_order`

function toPublic(row: ItemRow): CatalogItem {
  const price = Number(row.price)
  const compare = row.compare_at_price === null ? null : Number(row.compare_at_price)
  return {
    id: Number(row.id),
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    finish: row.finish,
    price,
    compareAtPrice: compare !== null && compare > price ? compare : null,
    images: row.images ?? [],
  }
}

function toAdmin(row: ItemRow): CatalogAdminItem {
  return {
    ...toPublic(row),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    productId: row.product_id === null ? null : Number(row.product_id),
    published: row.published,
    sortOrder: row.sort_order,
  }
}

export async function listPublishedItems(): Promise<CatalogItem[]> {
  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM catalog_items WHERE published ORDER BY sort_order, name`,
  )
  return rows.map(toPublic)
}

export async function getPublishedItem(id: number): Promise<CatalogItem | null> {
  const row = await queryOne<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM catalog_items WHERE id = $1 AND published`, [id])
  return row ? toPublic(row) : null
}

export async function listAdminItems(): Promise<CatalogAdminItem[]> {
  const rows = await query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM catalog_items ORDER BY sort_order, name`)
  return rows.map(toAdmin)
}

export async function getAdminItem(id: number): Promise<CatalogAdminItem | null> {
  const row = await queryOne<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM catalog_items WHERE id = $1`, [id])
  return row ? toAdmin(row) : null
}

type OrderRow = {
  id: string
  code: string
  customer_name: string
  customer_phone: string
  customer_company: string | null
  customer_city: string | null
  notes: string | null
  items: OrderLine[]
  total: string
  status: OrderStatus
  whatsapp_status: CatalogOrder['whatsappStatus']
  whatsapp_error: string | null
  created_at: Date
}

export async function listOrders(limit = 100): Promise<CatalogOrder[]> {
  const rows = await query<OrderRow>(
    `SELECT id, code, customer_name, customer_phone, customer_company, customer_city, notes, items, total,
            status, whatsapp_status, whatsapp_error, created_at
       FROM catalog_orders ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    code: r.code,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerCompany: r.customer_company,
    customerCity: r.customer_city,
    notes: r.notes,
    items: r.items,
    total: Number(r.total),
    status: r.status,
    whatsappStatus: r.whatsapp_status,
    whatsappError: r.whatsapp_error,
    createdAt: r.created_at.toISOString(),
  }))
}

export async function countNewOrders() {
  const row = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM catalog_orders WHERE status = 'novo'`)
  return row?.n ?? 0
}

import 'server-only'
import { query, queryOne } from '@/lib/db'
import type { CatalogAdminItem, CatalogItem, CatalogOrder, OrderLine, OrderStatus } from '@/lib/catalog/types'
import { CATEGORIES, FINISHES, normalizeText } from '@/lib/catalog/taxonomy'
import { listTaxonomyEntries, type TaxonomyKind } from '@/lib/catalog/taxonomy-store'

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

/**
 * Panel photos win; otherwise the linked product's marketplace thumbnail is used,
 * so auto-synced items aren't all "Foto em breve".
 */
const PUBLIC_SELECT = `
  SELECT ci.id, ci.product_id, ci.sku, ci.name, ci.description, ci.category, ci.finish, ci.price,
         ci.compare_at_price, ci.published, ci.sort_order,
         CASE WHEN cardinality(array_remove(ci.images, '')) > 0 THEN array_remove(ci.images, '')
              WHEN NULLIF(TRIM(p.image), '') IS NOT NULL THEN ARRAY[REGEXP_REPLACE(TRIM(p.image), '^http://', 'https://')]
              ELSE '{}'::text[] END AS images
    FROM catalog_items ci
    LEFT JOIN products p ON p.id = ci.product_id`

function cleanImages(row: ItemRow): ItemRow {
  return { ...row, images: (row.images ?? []).filter((src) => typeof src === 'string' && src.trim() !== '') }
}

/** Public storefront list. Items without any photo are shown with a "Foto em breve" placeholder. */
const PLAIN_SELECT = `SELECT ${ITEM_COLUMNS} FROM catalog_items ci`

function isMissingColumn(error: unknown) {
  const code = (error as { code?: string })?.code
  return code === '42703' || code === '42P01'
}

/** Falls back to catalog_items alone when the products.image column isn't in this database. */
async function selectPublic(where: string, params: unknown[] = []): Promise<ItemRow[]> {
  try {
    return await query<ItemRow>(`${PUBLIC_SELECT} ${where}`, params)
  } catch (error) {
    if (!isMissingColumn(error)) throw error
    console.error('[alure] catalog image fallback unavailable, using panel photos only:', error)
    return query<ItemRow>(`${PLAIN_SELECT} ${where}`, params)
  }
}

export async function listPublishedItems(): Promise<CatalogItem[]> {
  const rows = await selectPublic(`WHERE ci.published ORDER BY ci.sort_order, ci.name`)
  return rows.map(cleanImages).map(toPublic)
}

/** Catalog item ids ranked by real marketplace units sold in the last 90 days (linked via product_id). */
export async function listBestSellerIds(limit = 8): Promise<number[]> {
  try {
    const rows = await query<{ id: string }>(
      `SELECT ci.id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN catalog_items ci ON ci.product_id = oi.product_id
        WHERE ci.published
          AND o.order_date > now() - interval '90 days'
          AND o.status NOT ILIKE 'cancel%'
        GROUP BY ci.id
       HAVING SUM(oi.quantity) > 0
        ORDER BY SUM(oi.quantity) DESC
        LIMIT $1`,
      [limit],
    )
    return rows.map((r) => Number(r.id))
  } catch (error) {
    console.error('[alure] catalog best sellers failed:', error)
    return []
  }
}

export async function getPublishedItem(id: number): Promise<CatalogItem | null> {
  const [row] = await selectPublic(`WHERE ci.id = $1 AND ci.published`, [id])
  return row ? toPublic(cleanImages(row)) : null
}

export async function listAdminItems(): Promise<CatalogAdminItem[]> {
  const rows = await query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM catalog_items ORDER BY sort_order, name`)
  return rows.map(toAdmin)
}

export type TaxonomyOptionGroup = { label: string; options: string[] }
export type CatalogTaxonomyOptions = { categories: TaxonomyOptionGroup[]; finishes: TaxonomyOptionGroup[] }

function groupOptions(standard: string[], used: string[], usedLabel: string): TaxonomyOptionGroup[] {
  const known = new Set(standard.map(normalizeText))
  const seen = new Set<string>()
  const extra: string[] = []
  for (const value of used) {
    const key = normalizeText(value)
    if (known.has(key) || seen.has(key)) continue
    seen.add(key)
    extra.push(value)
  }
  extra.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return [{ label: 'Padrão do catálogo', options: standard }, ...(extra.length ? [{ label: usedLabel, options: extra }] : [])]
}

export async function getCatalogTaxonomyOptions(): Promise<CatalogTaxonomyOptions> {
  const entries = await listTaxonomyEntries()

  if (entries) {
    const pick = (kind: TaxonomyKind, standard: boolean) =>
      entries.filter((e) => e.kind === kind && !e.hidden && Boolean(e.defaultSlug) === standard).map((e) => e.label)
    return {
      categories: groupOptions(pick('category', true), pick('category', false), 'Criadas por você'),
      finishes: groupOptions(pick('finish', true), pick('finish', false), 'Criados por você'),
    }
  }

  const rows = await query<{ kind: TaxonomyKind; value: string }>(
    `SELECT 'category' AS kind, btrim(category) AS value FROM catalog_items WHERE btrim(coalesce(category, '')) <> ''
     UNION
     SELECT 'finish', btrim(finish) FROM catalog_items WHERE btrim(coalesce(finish, '')) <> ''`,
  )
  const used = (kind: TaxonomyKind) => rows.filter((r) => r.kind === kind).map((r) => r.value)
  return {
    categories: groupOptions(
      CATEGORIES.map((c) => c.label),
      used('category'),
      'Criadas por você',
    ),
    finishes: groupOptions(
      FINISHES.map((f) => f.label),
      used('finish'),
      'Criados por você',
    ),
  }
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

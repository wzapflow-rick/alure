'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { del, put } from '@vercel/blob'
import { z } from 'zod'
import { query, queryOne, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { authed, failure, formObject, optionalNumber, optionalText, type ActionState } from '@/lib/actions/shared'
import { resendCatalogOrder } from '@/lib/catalog/delivery'

const ADMIN_PATH = '/venda-direta'

function revalidateCatalog(id?: number) {
  revalidatePath(ADMIN_PATH)
  revalidatePath('/catalogo')
  if (id) {
    revalidatePath(`${ADMIN_PATH}/${id}`)
    revalidatePath(`/catalogo/${id}`)
  }
}

const itemSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  productId: optionalNumber,
  sku: z.string().trim().max(64).optional().default(''),
  name: z.string().trim().max(200).optional().default(''),
  description: optionalText,
  category: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  finish: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  price: z
    .string()
    .trim()
    .min(1, 'Informe o preço de venda direta')
    .transform((v) => Number(v.replace(/\./g, '').replace(',', '.')))
    .refine((v) => Number.isFinite(v) && v > 0, 'Preço inválido'),
  compareAtPrice: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/\./g, '').replace(',', '.')) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Preço de referência inválido'),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional().default(0),
  published: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
})

export async function saveCatalogItem(_: ActionState, formData: FormData): Promise<ActionState> {
  let createdId: number | null = null
  try {
    const user = await authed()
    const input = itemSchema.parse(formObject(formData))

    let { sku, name } = input
    if ((!sku || !name) && input.productId) {
      const product = await queryOne<{ sku: string; name: string }>('SELECT sku, name FROM products WHERE id = $1', [
        input.productId,
      ])
      sku ||= product?.sku ?? ''
      name ||= product?.name ?? ''
    }
    if (!sku) return { ok: false, message: 'Informe o SKU ou vincule um produto.' }
    if (name.length < 2) return { ok: false, message: 'Informe o nome do produto.' }

    const values = [
      input.productId,
      sku,
      name,
      input.description,
      input.category,
      input.finish,
      input.price,
      input.compareAtPrice,
      input.published,
      input.sortOrder,
    ]

    await withTransaction(async (client) => {
      if (input.id) {
        const old = await client.query('SELECT * FROM catalog_items WHERE id = $1 FOR UPDATE', [input.id])
        if (!old.rows[0]) throw new Error('not found')
        await client.query(
          `UPDATE catalog_items SET product_id=$2, sku=$3, name=$4, description=$5, category=$6, finish=$7,
                  price=$8, compare_at_price=$9, published=$10, sort_order=$11, updated_at=now()
            WHERE id=$1`,
          [input.id, ...values],
        )
        await logAudit(
          { user, action: 'catalog.update', entityType: 'catalog_items', entityId: input.id, oldValue: old.rows[0], newValue: input },
          client,
        )
      } else {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO catalog_items (product_id, sku, name, description, category, finish, price, compare_at_price, published, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          values,
        )
        createdId = Number(rows[0].id)
        await logAudit({ user, action: 'catalog.create', entityType: 'catalog_items', entityId: createdId, newValue: input }, client)
      }
    })
    revalidateCatalog(input.id)
    if (!createdId) return { ok: true, message: 'Item salvo.' }
  } catch (error) {
    return failure(error)
  }
  redirect(`${ADMIN_PATH}/${createdId}`)
}

const ALLOWED_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Newer Blob stores authenticate via OIDC (BLOB_STORE_ID + VERCEL_OIDC_TOKEN) instead of a read-write token.
function hasBlobCredentials() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export async function uploadCatalogImages(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const id = z.coerce.number().int().positive().parse(formData.get('id'))
    const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) return { ok: false, message: 'Escolha ao menos uma foto.' }
    if (files.length > 8) return { ok: false, message: 'Envie no máximo 8 fotos por vez.' }
    for (const f of files) {
      if (!ALLOWED_TYPES[f.type]) return { ok: false, message: `${f.name}: use JPG, PNG ou WebP.` }
      if (f.size > MAX_IMAGE_BYTES) return { ok: false, message: `${f.name}: limite de 8 MB por foto.` }
    }
    if (!hasBlobCredentials()) {
      return { ok: false, message: 'Armazenamento de fotos não configurado: conecte o Blob ao projeto na Vercel.' }
    }

    const item = await queryOne<{ sku: string }>('SELECT sku FROM catalog_items WHERE id = $1', [id])
    if (!item) return { ok: false, message: 'Item não encontrado.' }
    const slug = item.sku.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()

    const urls: string[] = []
    for (const f of files) {
      const blob = await put(`catalogo/${slug}.${ALLOWED_TYPES[f.type]}`, f, {
        access: 'public',
        addRandomSuffix: true,
        contentType: f.type,
      })
      urls.push(blob.url)
    }
    await query(`UPDATE catalog_items SET images = images || $2::text[], updated_at = now() WHERE id = $1`, [id, urls])
    await logAudit({ user, action: 'catalog.images.add', entityType: 'catalog_items', entityId: id, newValue: urls })
    revalidateCatalog(id)
    return { ok: true, message: files.length === 1 ? 'Foto enviada.' : `${files.length} fotos enviadas.` }
  } catch (error) {
    return failure(error)
  }
}

const imageSchema = z.object({ id: z.coerce.number().int().positive(), url: z.string().url() })

export async function removeCatalogImage(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id, url } = imageSchema.parse(formObject(formData))
    await query(`UPDATE catalog_items SET images = array_remove(images, $2), updated_at = now() WHERE id = $1`, [id, url])
    if (hasBlobCredentials() && url.includes('.blob.vercel-storage.com')) {
      await del(url).catch((e) => console.error('[alure] blob delete failed:', e))
    }
    await logAudit({ user, action: 'catalog.images.remove', entityType: 'catalog_items', entityId: id, oldValue: url })
    revalidateCatalog(id)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function makePrimaryImage(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await authed()
    const { id, url } = imageSchema.parse(formObject(formData))
    await query(
      `UPDATE catalog_items SET images = ARRAY[$2]::text[] || array_remove(images, $2), updated_at = now()
        WHERE id = $1 AND $2 = ANY(images)`,
      [id, url],
    )
    revalidateCatalog(id)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function toggleCatalogPublished(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const id = z.coerce.number().int().positive().parse(formData.get('id'))
    const published = formData.get('published') === 'true'
    await query(`UPDATE catalog_items SET published = $2, updated_at = now() WHERE id = $1`, [id, published])
    await logAudit({ user, action: 'catalog.publish', entityType: 'catalog_items', entityId: id, newValue: { published } })
    revalidateCatalog(id)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteCatalogItem(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const id = z.coerce.number().int().positive().parse(formData.get('id'))
    const old = await queryOne<{ images: string[] }>('DELETE FROM catalog_items WHERE id = $1 RETURNING *', [id])
    if (old?.images?.length && hasBlobCredentials()) {
      await del(old.images).catch((e) => console.error('[alure] blob delete failed:', e))
    }
    await logAudit({ user, action: 'catalog.delete', entityType: 'catalog_items', entityId: id, oldValue: old })
    revalidateCatalog()
  } catch (error) {
    return failure(error)
  }
  redirect(ADMIN_PATH)
}

const ORDER_STATUSES = ['novo', 'em_atendimento', 'fechado', 'cancelado'] as const

export async function updateCatalogOrderStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = z
      .object({ id: z.coerce.number().int().positive(), status: z.enum(ORDER_STATUSES) })
      .parse(formObject(formData))
    await query(`UPDATE catalog_orders SET status = $2, updated_at = now() WHERE id = $1`, [input.id, input.status])
    await logAudit({ user, action: 'catalog.order.status', entityType: 'catalog_orders', entityId: input.id, newValue: input })
    revalidatePath(`${ADMIN_PATH}/pedidos`)
    revalidatePath(ADMIN_PATH)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function resendCatalogOrderWhatsapp(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = z.coerce.number().int().positive().parse(formData.get('id'))
    const result = await resendCatalogOrder(id)
    revalidatePath(`${ADMIN_PATH}/pedidos`)
    return result.ok ? { ok: true, message: 'Enviado.' } : { ok: false, message: result.error ?? 'Falha no envio.' }
  } catch (error) {
    return failure(error)
  }
}

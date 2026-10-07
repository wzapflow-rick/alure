'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { queryOne, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { authed, failure, formObject, type ActionState } from '@/lib/actions/shared'

const COLUMN = { category: 'category', finish: 'finish' } as const
const NOUN = { category: 'Categoria', finish: 'Acabamento' } as const

const kindSchema = z.enum(['category', 'finish'])
const labelSchema = z.string().trim().min(2, 'Use pelo menos 2 letras.').max(80, 'Use no máximo 80 caracteres.')
const idSchema = z.coerce.number().int().positive()

type EntryRow = { id: string; kind: 'category' | 'finish'; label: string; default_slug: string | null; hidden: boolean }

function revalidate() {
  revalidatePath('/venda-direta', 'layout')
  revalidatePath('/catalogo', 'layout')
}

function missingTable(error: unknown): ActionState | null {
  if ((error as { code?: string })?.code === '42P01') {
    return { ok: false, message: 'Rode o script db/017_catalog_taxonomy.sql no banco para liberar esta tela.' }
  }
  return null
}

export async function createTaxonomyEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = z.object({ kind: kindSchema, label: labelSchema }).parse(formObject(formData))

    const existing = await queryOne<EntryRow>(
      `SELECT id, kind, label, default_slug, hidden FROM catalog_taxonomy WHERE kind = $1 AND lower(btrim(label)) = lower($2)`,
      [input.kind, input.label],
    )
    if (existing && !existing.hidden) return { ok: false, message: `Já existe “${existing.label}”.` }

    if (existing) {
      await queryOne(`UPDATE catalog_taxonomy SET hidden = false, updated_at = now() WHERE id = $1`, [existing.id])
    } else {
      await queryOne(`INSERT INTO catalog_taxonomy (kind, label, sort_order) VALUES ($1, $2, 1000)`, [input.kind, input.label])
    }
    await logAudit({ user, action: 'catalog_taxonomy.create', entityType: 'catalog_taxonomy', newValue: input })
    revalidate()
    return { ok: true, message: `${NOUN[input.kind]} “${input.label}” criada.` }
  } catch (error) {
    return missingTable(error) ?? failure(error)
  }
}

export async function renameTaxonomyEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = z.object({ id: idSchema, label: labelSchema }).parse(formObject(formData))

    const message = await withTransaction(async (client) => {
      const { rows } = await client.query<EntryRow>(
        `SELECT id, kind, label, default_slug, hidden FROM catalog_taxonomy WHERE id = $1 FOR UPDATE`,
        [input.id],
      )
      const entry = rows[0]
      if (!entry) throw new Error('not found')
      if (entry.label === input.label) return 'Nada mudou.'
      const column = COLUMN[entry.kind]

      const conflict = await client.query<EntryRow>(
        `SELECT id, kind, label, default_slug, hidden FROM catalog_taxonomy
          WHERE kind = $1 AND lower(btrim(label)) = lower($2) AND id <> $3`,
        [entry.kind, input.label, entry.id],
      )
      const target = conflict.rows[0]

      if (target) {
        await client.query(
          `UPDATE catalog_items SET ${column} = $1, updated_at = now() WHERE lower(btrim(${column})) = lower(btrim($2))`,
          [target.label, entry.label],
        )
        if (target.hidden) await client.query(`UPDATE catalog_taxonomy SET hidden = false, updated_at = now() WHERE id = $1`, [target.id])
        if (entry.default_slug) {
          await client.query(`UPDATE catalog_taxonomy SET hidden = true, updated_at = now() WHERE id = $1`, [entry.id])
        } else {
          await client.query(`DELETE FROM catalog_taxonomy WHERE id = $1`, [entry.id])
        }
        await logAudit(
          { user, action: 'catalog_taxonomy.merge', entityType: 'catalog_taxonomy', entityId: entry.id, oldValue: entry, newValue: target },
          client,
        )
        return `“${entry.label}” foi juntada com “${target.label}”.`
      }

      await client.query(`UPDATE catalog_taxonomy SET label = $2, updated_at = now() WHERE id = $1`, [entry.id, input.label])
      await client.query(
        `UPDATE catalog_items SET ${column} = $1, updated_at = now() WHERE lower(btrim(${column})) = lower(btrim($2))`,
        [input.label, entry.label],
      )
      await logAudit(
        { user, action: 'catalog_taxonomy.rename', entityType: 'catalog_taxonomy', entityId: entry.id, oldValue: entry.label, newValue: input.label },
        client,
      )
      return `Renomeada para “${input.label}”.`
    })

    revalidate()
    return { ok: true, message }
  } catch (error) {
    return missingTable(error) ?? failure(error)
  }
}

export async function deleteTaxonomyEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = z.object({ id: idSchema }).parse(formObject(formData))

    const label = await withTransaction(async (client) => {
      const { rows } = await client.query<EntryRow>(
        `SELECT id, kind, label, default_slug, hidden FROM catalog_taxonomy WHERE id = $1 FOR UPDATE`,
        [id],
      )
      const entry = rows[0]
      if (!entry) throw new Error('not found')
      const column = COLUMN[entry.kind]
      await client.query(
        `UPDATE catalog_items SET ${column} = NULL, updated_at = now() WHERE lower(btrim(${column})) = lower(btrim($1))`,
        [entry.label],
      )
      if (entry.default_slug) {
        await client.query(`UPDATE catalog_taxonomy SET hidden = true, updated_at = now() WHERE id = $1`, [id])
      } else {
        await client.query(`DELETE FROM catalog_taxonomy WHERE id = $1`, [id])
      }
      await logAudit({ user, action: 'catalog_taxonomy.delete', entityType: 'catalog_taxonomy', entityId: id, oldValue: entry }, client)
      return entry.label
    })

    revalidate()
    return { ok: true, message: `“${label}” excluída.` }
  } catch (error) {
    return missingTable(error) ?? failure(error)
  }
}

export async function restoreTaxonomyEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = z.object({ id: idSchema }).parse(formObject(formData))
    await queryOne(`UPDATE catalog_taxonomy SET hidden = false, updated_at = now() WHERE id = $1`, [id])
    await logAudit({ user, action: 'catalog_taxonomy.restore', entityType: 'catalog_taxonomy', entityId: id })
    revalidate()
    return { ok: true, message: 'Restaurada.' }
  } catch (error) {
    return missingTable(error) ?? failure(error)
  }
}

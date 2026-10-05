'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { pool } from '@/lib/db'
import { authed, failure, type ActionState } from '@/lib/actions/shared'
import { normalizePhone } from '@/lib/broadcast/text'
import { evolutionConfig } from '@/lib/notify/evolution'
import { loadProspectSettings } from '@/lib/prospect/queries'
import { MAX_PAGES, searchGoogleMaps, serpApiKey } from '@/lib/prospect/serpapi'
import { runVerification, summarize } from '@/lib/prospect/verify'

const MAX_LIST_ADD = 1000

function refresh() {
  revalidatePath('/disparos', 'layout')
}

const idSchema = z.string().regex(/^\d+$/, 'Registro inválido.')

const searchSchema = z.object({
  query: z.string().trim().min(2, 'Diga o que buscar (ex.: loja de móveis).').max(120),
  location: z.string().trim().max(120),
  pages: z.coerce.number().int().min(1).max(MAX_PAGES),
})

export async function runProspectSearch(_: ActionState, fd: FormData): Promise<ActionState> {
  let searchId: string
  try {
    await authed()
    if (!serpApiKey()) return { ok: false, message: 'Configure SERPAPI_API_KEY nas variáveis do projeto de hospedagem.' }
    const v = searchSchema.parse({ query: fd.get('query'), location: fd.get('location') ?? '', pages: fd.get('pages') || 1 })
    const q = v.location ? `${v.query} em ${v.location}` : v.query

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO prospect_searches (query, location, pages, status) VALUES ($1, NULLIF($2, ''), $3, 'running') RETURNING id::text`,
      [v.query, v.location, v.pages],
    )
    searchId = rows[0].id

    let places
    try {
      places = await searchGoogleMaps(q, v.pages)
    } catch (e) {
      const message = (e as Error).message.slice(0, 300)
      await pool.query(`UPDATE prospect_searches SET status = 'failed', error = $2 WHERE id = $1`, [searchId, message])
      refresh()
      return { ok: false, message }
    }

    if (places.length) {
      const { rows: upserted } = await pool.query<{ inserted: boolean }>(
        `INSERT INTO prospects (place_id, search_id, name, category, address, phone_raw, phone, website, rating, reviews, wa_status)
         SELECT t.place_id, $1, t.name, NULLIF(t.category, ''), NULLIF(t.address, ''), NULLIF(t.phone_raw, ''), NULLIF(t.phone, ''),
                NULLIF(t.website, ''), t.rating, t.reviews,
                CASE WHEN t.phone = '' AND t.website = '' THEN 'no_phone' ELSE 'pending' END
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::numeric[], $10::int[])
                AS t(place_id, name, category, address, phone_raw, phone, website, rating, reviews)
         ON CONFLICT (place_id) DO UPDATE SET
           search_id = EXCLUDED.search_id, name = EXCLUDED.name, category = EXCLUDED.category, address = EXCLUDED.address,
           phone_raw = EXCLUDED.phone_raw, website = EXCLUDED.website, rating = EXCLUDED.rating, reviews = EXCLUDED.reviews,
           phone = EXCLUDED.phone,
           wa_status = CASE WHEN prospects.phone IS DISTINCT FROM EXCLUDED.phone THEN EXCLUDED.wa_status ELSE prospects.wa_status END,
           site_checked_at = CASE WHEN prospects.website IS DISTINCT FROM EXCLUDED.website THEN NULL ELSE prospects.site_checked_at END
         RETURNING (xmax = 0) AS inserted`,
        [
          searchId,
          places.map((p) => p.placeId),
          places.map((p) => p.name),
          places.map((p) => p.category ?? ''),
          places.map((p) => p.address ?? ''),
          places.map((p) => p.phone ?? ''),
          places.map((p) => (p.phone ? normalizePhone(p.phone) ?? '' : '')),
          places.map((p) => p.website ?? ''),
          places.map((p) => p.rating),
          places.map((p) => p.reviews),
        ],
      )
      await pool.query(`UPDATE prospect_searches SET status = 'done', found = $2, created = $3 WHERE id = $1`, [
        searchId,
        places.length,
        upserted.filter((r) => r.inserted).length,
      ])
    } else {
      await pool.query(`UPDATE prospect_searches SET status = 'done' WHERE id = $1`, [searchId])
    }

    const settings = await loadProspectSettings()
    if (places.length && settings.auto_check && (settings.wa_check_enabled || settings.site_scan_enabled)) {
      await runVerification({ searchId, limit: 150 })
    }
  } catch (e) {
    return failure(e)
  }
  refresh()
  redirect(`/disparos/prospeccao?busca=${searchId}`)
}

export async function verifyProspectsNow(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const raw = String(fd.get('search_id') ?? '')
    const searchId = raw ? idSchema.parse(raw) : null
    const settings = await loadProspectSettings()
    if (!settings.wa_check_enabled && !settings.site_scan_enabled) {
      return { ok: false, message: 'A verificação está desligada. Ative acima para checar os números.' }
    }
    if (settings.wa_check_enabled && !evolutionConfig()) {
      return { ok: false, message: 'Evolution API não configurada; não dá para checar WhatsApp.' }
    }
    const r = await runVerification({ searchId, limit: 200 })
    refresh()
    return { ok: !r.error, message: summarize(r) }
  } catch (e) {
    return failure(e)
  }
}

export async function saveProspectSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const cap = z.coerce.number().int().min(20, 'Mínimo de 20 por dia.').max(2000, 'Máximo de 2000 por dia.').parse(fd.get('daily_check_cap'))
    await pool.query(
      `UPDATE prospect_settings SET wa_check_enabled = $1, site_scan_enabled = $2, auto_check = $3, require_whatsapp = $4,
              daily_check_cap = $5, updated_at = now() WHERE id = 1`,
      [fd.get('wa_check_enabled') === 'on', fd.get('site_scan_enabled') === 'on', fd.get('auto_check') === 'on', fd.get('require_whatsapp') === 'on', cap],
    )
    refresh()
    return { ok: true, message: 'Verificação atualizada.' }
  } catch (e) {
    return failure(e)
  }
}

function slugify(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

export async function addToProspectList(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const ids = fd.getAll('ids').map(String).filter((id) => /^\d+$/.test(id))
    if (!ids.length) return { ok: false, message: 'Marque pelo menos um contato.' }
    if (ids.length > MAX_LIST_ADD) return { ok: false, message: `Máximo de ${MAX_LIST_ADD} por vez.` }

    let listId = String(fd.get('list_id') ?? '')
    let listName: string
    if (listId) {
      idSchema.parse(listId)
      const { rows } = await pool.query<{ name: string }>(`SELECT name FROM prospect_lists WHERE id = $1`, [listId])
      if (!rows[0]) return { ok: false, message: 'Lista não encontrada.' }
      listName = rows[0].name
    } else {
      listName = z.string().trim().min(2, 'Dê um nome à lista ou escolha uma existente.').max(60).parse(String(fd.get('list_name') ?? ''))
      const base = slugify(listName) || 'lista'
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO prospect_lists (name, tag)
         VALUES ($1, 'prosp-' || $2 || CASE WHEN EXISTS (SELECT 1 FROM prospect_lists WHERE tag = 'prosp-' || $2)
                                            THEN '-' || (SELECT count(*) + 1 FROM prospect_lists) ELSE '' END)
         RETURNING id::text`,
        [listName, base],
      )
      listId = rows[0].id
    }

    const { rowCount } = await pool.query(
      `INSERT INTO prospect_list_items (list_id, prospect_id) SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
      [listId, ids],
    )
    refresh()
    return { ok: true, message: `${rowCount ?? 0} adicionados à lista “${listName}”.` }
  } catch (e) {
    return failure(e)
  }
}

export async function exportProspectList(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    const settings = await loadProspectSettings()
    const { rows: lists } = await pool.query<{ name: string; tag: string }>(`SELECT name, tag FROM prospect_lists WHERE id = $1`, [id])
    const list = lists[0]
    if (!list) return { ok: false, message: 'Lista não encontrada.' }

    const { rows } = await pool.query<{ inserted: boolean }>(
      `INSERT INTO broadcast_contacts (phone, name, tags, source, wa_exists, wa_checked_at)
       SELECT DISTINCT ON (COALESCE(p.site_whatsapp, p.phone))
              COALESCE(p.site_whatsapp, p.phone), p.name, ARRAY[$2::text], 'Prospecção: ' || $3,
              CASE WHEN p.wa_status = 'yes' THEN true END, CASE WHEN p.wa_status = 'yes' THEN p.wa_checked_at END
         FROM prospect_list_items i JOIN prospects p ON p.id = i.prospect_id
        WHERE i.list_id = $1 AND COALESCE(p.site_whatsapp, p.phone) IS NOT NULL
          AND (p.wa_status = 'yes' OR (NOT $4 AND p.wa_status IN ('pending','error')))
       ON CONFLICT (phone) DO UPDATE SET
         name = COALESCE(broadcast_contacts.name, EXCLUDED.name),
         tags = ARRAY(SELECT DISTINCT unnest(broadcast_contacts.tags || EXCLUDED.tags)),
         wa_exists = COALESCE(EXCLUDED.wa_exists, broadcast_contacts.wa_exists),
         wa_checked_at = COALESCE(EXCLUDED.wa_checked_at, broadcast_contacts.wa_checked_at)
       RETURNING (xmax = 0) AS inserted`,
      [id, list.tag, list.name, settings.require_whatsapp],
    )
    if (!rows.length) {
      return {
        ok: false,
        message: settings.require_whatsapp
          ? 'Nenhum contato com WhatsApp confirmado nesta lista. Rode a verificação primeiro.'
          : 'Nenhum contato com telefone nesta lista.',
      }
    }
    await pool.query(`UPDATE prospect_lists SET exported_at = now(), exported_count = $2 WHERE id = $1`, [id, rows.length])
    const created = rows.filter((r) => r.inserted).length
    refresh()
    return {
      ok: true,
      message: `${rows.length} contatos com a etiqueta “${list.tag}” (${created} novos). Crie a campanha escolhendo essa etiqueta.`,
    }
  } catch (e) {
    return failure(e)
  }
}

export async function deleteProspectList(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    await pool.query(`DELETE FROM prospect_lists WHERE id = $1`, [id])
    refresh()
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

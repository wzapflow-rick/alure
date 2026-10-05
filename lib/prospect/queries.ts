import 'server-only'
import { pool } from '@/lib/db'
import { TZ } from '@/lib/broadcast/queries'

export type ProspectSettings = {
  wa_check_enabled: boolean
  site_scan_enabled: boolean
  auto_check: boolean
  require_whatsapp: boolean
  daily_check_cap: number
}

export type WaStatus = 'pending' | 'yes' | 'no' | 'no_phone' | 'error'

export async function prospectSchemaReady() {
  const { rows } = await pool.query<{ ok: boolean }>(`SELECT to_regclass('public.prospect_list_items') IS NOT NULL AS ok`)
  return Boolean(rows[0]?.ok)
}

export async function loadProspectSettings(): Promise<ProspectSettings> {
  const { rows } = await pool.query<ProspectSettings>(
    `SELECT wa_check_enabled, site_scan_enabled, auto_check, require_whatsapp, daily_check_cap FROM prospect_settings WHERE id = 1`,
  )
  if (!rows[0]) throw new Error('Configuração de prospecção ausente. Rode db/014_prospeccao.sql.')
  return rows[0]
}

export async function checksToday() {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM prospects
      WHERE wa_status IN ('yes','no') AND wa_checked_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)`,
    [TZ],
  )
  return rows[0]?.n ?? 0
}

export async function prospectStats() {
  const { rows } = await pool.query<Record<WaStatus | 'total', number>>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE wa_status = 'yes')::int AS yes,
            count(*) FILTER (WHERE wa_status = 'no')::int AS no,
            count(*) FILTER (WHERE wa_status = 'pending')::int AS pending,
            count(*) FILTER (WHERE wa_status = 'no_phone')::int AS no_phone,
            count(*) FILTER (WHERE wa_status = 'error')::int AS error
       FROM prospects`,
  )
  return rows[0]
}

export type SearchRow = {
  id: string
  query: string
  location: string | null
  pages: number
  found: number
  created: number
  status: 'running' | 'done' | 'failed'
  error: string | null
  created_at: string
  with_whatsapp: number
}

export async function listSearches(limit = 12) {
  const { rows } = await pool.query<SearchRow>(
    `SELECT s.id::text, s.query, s.location, s.pages, s.found, s.created, s.status, s.error, s.created_at::text,
            (SELECT count(*)::int FROM prospects p WHERE p.search_id = s.id AND p.wa_status = 'yes') AS with_whatsapp
       FROM prospect_searches s ORDER BY s.id DESC LIMIT $1`,
    [limit],
  )
  return rows
}

export type ProspectRow = {
  id: string
  name: string
  category: string | null
  address: string | null
  phone: string | null
  site_whatsapp: string | null
  website: string | null
  rating: string | null
  reviews: number | null
  wa_status: WaStatus
  in_base: boolean
  lists: string[]
}

export const PROSPECT_FILTERS = ['all', 'yes', 'no', 'pending', 'no_phone', 'error'] as const
export type ProspectFilter = (typeof PROSPECT_FILTERS)[number]

export async function listProspects(opts: { searchId: string | null; filter: ProspectFilter; q: string }) {
  const { rows } = await pool.query<ProspectRow>(
    `SELECT p.id::text, p.name, p.category, p.address, p.phone, p.site_whatsapp, p.website, p.rating::text, p.reviews, p.wa_status,
            EXISTS (SELECT 1 FROM broadcast_contacts b WHERE b.phone = COALESCE(p.site_whatsapp, p.phone)) AS in_base,
            COALESCE((SELECT array_agg(l.name ORDER BY l.name) FROM prospect_list_items i JOIN prospect_lists l ON l.id = i.list_id
                       WHERE i.prospect_id = p.id), '{}') AS lists
       FROM prospects p
      WHERE ($1::bigint IS NULL OR p.search_id = $1)
        AND ($2 = 'all' OR p.wa_status = $2)
        AND ($3 = '' OR p.name ILIKE '%' || $3 || '%' OR p.category ILIKE '%' || $3 || '%' OR p.address ILIKE '%' || $3 || '%')
      ORDER BY (p.wa_status = 'yes') DESC, p.reviews DESC NULLS LAST, p.id DESC
      LIMIT 300`,
    [opts.searchId, opts.filter, opts.q.trim()],
  )
  return rows
}

export type ListRow = {
  id: string
  name: string
  tag: string
  total: number
  with_whatsapp: number
  exportable: number
  exported_at: string | null
  exported_count: number
}

export async function listProspectLists(requireWhatsApp: boolean) {
  const { rows } = await pool.query<ListRow>(
    `SELECT l.id::text, l.name, l.tag, l.exported_at::text, l.exported_count,
            count(p.id)::int AS total,
            count(p.id) FILTER (WHERE p.wa_status = 'yes')::int AS with_whatsapp,
            count(p.id) FILTER (WHERE COALESCE(p.site_whatsapp, p.phone) IS NOT NULL
                                  AND (p.wa_status = 'yes' OR (NOT $1 AND p.wa_status IN ('pending','error'))))::int AS exportable
       FROM prospect_lists l
       LEFT JOIN prospect_list_items i ON i.list_id = l.id
       LEFT JOIN prospects p ON p.id = i.prospect_id
      GROUP BY l.id ORDER BY l.id DESC`,
    [requireWhatsApp],
  )
  return rows
}

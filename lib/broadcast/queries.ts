import 'server-only'
import { pool } from '@/lib/db'
import { effectiveDailyCap, hourlyCeiling, type BroadcastSettings } from '@/lib/broadcast/settings'

export const TZ = 'America/Sao_Paulo'

export async function broadcastSchemaReady() {
  const { rows } = await pool.query<{ ok: boolean }>(`SELECT to_regclass('public.broadcast_events') IS NOT NULL AS ok`)
  return Boolean(rows[0]?.ok)
}

export async function loadSettings(): Promise<BroadcastSettings> {
  // to_jsonb keeps this working before db/018 runs: missing columns just come back undefined.
  const { rows } = await pool.query(
    `SELECT to_jsonb(b) AS j, ((now() AT TIME ZONE $1)::date - b.warmup_started_on) AS warmup_days
       FROM broadcast_settings b WHERE id = 1`,
    [TZ],
  )
  const r = rows[0]
  if (!r) throw new Error('Configuração de disparos ausente. Rode db/013_disparos.sql.')
  const j = r.j as Record<string, unknown>
  return {
    ...j,
    weekdays: (j.weekdays as number[]).map(Number),
    warmup_days: r.warmup_days === null ? null : Number(r.warmup_days),
    ramp_cap: j.ramp_cap == null ? null : Number(j.ramp_cap),
    ramp_evaluated_on: (j.ramp_evaluated_on as string) ?? null,
    quarantine_until: (j.quarantine_until as string) ?? null,
    last_state: (j.last_state as string) ?? null,
    quarantine_hours: Number(j.quarantine_hours ?? 72),
    incident_cut_pct: Number(j.incident_cut_pct ?? 50),
    min_reply_rate: Number(j.min_reply_rate ?? 5),
    cold_share_pct: Number(j.cold_share_pct ?? 60),
    cold_delay_pct: Number(j.cold_delay_pct ?? 50),
    cold_require_two_step: j.cold_require_two_step == null ? true : Boolean(j.cold_require_two_step),
  } as BroadcastSettings
}

/** Cold contact: came from Prospecção and never answered. Expects the contacts table aliased as `c`. */
export const COLD_CONTACT_SQL = `(c.source ILIKE 'Prospecção:%' AND c.last_reply_at IS NULL)`

/** db/019 adds two-step campaigns and cold tracking; the sender refuses to run without it. */
export async function coldSchemaReady() {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'broadcast_messages' AND column_name = 'followup_status') AS ok`,
  )
  return Boolean(rows[0]?.ok)
}

export async function sendCounts() {
  const { rows } = await pool.query<{ today: number; hour: number; cold_today: number }>(
    `SELECT COUNT(*) FILTER (WHERE sent_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1))::int AS today,
            COUNT(*) FILTER (WHERE sent_at >= now() - interval '1 hour')::int AS hour,
            COUNT(*) FILTER (WHERE (to_jsonb(m)->>'cold')::boolean
                               AND sent_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1))::int AS cold_today
       FROM broadcast_messages m
      WHERE status = 'sent' AND sent_at >= now() - interval '2 days'`,
    [TZ],
  )
  return rows[0] ?? { today: 0, hour: 0, cold_today: 0 }
}

export type CampaignRow = {
  id: string
  name: string
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled'
  templates: string[]
  link_url: string | null
  append_link: boolean
  opt_out_footer: boolean
  tag_filter: string | null
  next_send_at: string | null
  pause_reason: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  total: number
  pending: number
  sent: number
  failed: number
  skipped: number
  replied: number
  two_step: boolean
  followup_templates: string[]
  offers_sent: number
  offers_pending: number
  cold_sent: number
}

// to_jsonb keeps the pages working before db/019 runs.
const CAMPAIGN_SELECT = `
  SELECT c.id::text, c.name, c.status, c.templates, c.link_url, c.append_link, c.opt_out_footer, c.tag_filter,
         c.next_send_at::text, c.pause_reason, c.started_at::text, c.finished_at::text, c.created_at::text,
         COALESCE((to_jsonb(c)->>'two_step')::boolean, false) AS two_step,
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(to_jsonb(c)->'followup_templates')), '{}') AS followup_templates,
         COUNT(m.id) FILTER (WHERE to_jsonb(m)->>'followup_status' = 'sent')::int AS offers_sent,
         COUNT(m.id) FILTER (WHERE to_jsonb(m)->>'followup_status' IN ('pending','sending'))::int AS offers_pending,
         COUNT(m.id) FILTER (WHERE m.status = 'sent' AND (to_jsonb(m)->>'cold')::boolean)::int AS cold_sent,
         COUNT(m.id)::int AS total,
         COUNT(m.id) FILTER (WHERE m.status IN ('pending','sending'))::int AS pending,
         COUNT(m.id) FILTER (WHERE m.status = 'sent')::int AS sent,
         COUNT(m.id) FILTER (WHERE m.status = 'failed')::int AS failed,
         COUNT(m.id) FILTER (WHERE m.status = 'skipped')::int AS skipped,
         COUNT(m.id) FILTER (WHERE m.replied_at IS NOT NULL)::int AS replied
    FROM broadcast_campaigns c
    LEFT JOIN broadcast_messages m ON m.campaign_id = c.id`

export async function listCampaigns() {
  const { rows } = await pool.query<CampaignRow>(`${CAMPAIGN_SELECT} GROUP BY c.id ORDER BY c.created_at DESC LIMIT 50`)
  return rows
}

export async function getCampaign(id: string) {
  if (!/^\d+$/.test(id)) return null
  const { rows } = await pool.query<CampaignRow>(`${CAMPAIGN_SELECT} WHERE c.id = $1 GROUP BY c.id`, [id])
  return rows[0] ?? null
}

export async function campaignDetail(id: string) {
  const [skips, recent, events] = await Promise.all([
    pool.query<{ reason: string; n: number }>(
      `SELECT COALESCE(skip_reason, 'outro') AS reason, COUNT(*)::int AS n FROM broadcast_messages
        WHERE campaign_id = $1 AND status = 'skipped' GROUP BY 1 ORDER BY 2 DESC`,
      [id],
    ),
    pool.query<{
      id: string
      phone: string
      name: string | null
      status: string
      skip_reason: string | null
      error: string | null
      rendered: string | null
      at: string | null
      replied: boolean
      reply_text: string | null
      followup_status: string | null
      followup_rendered: string | null
      cold: boolean
    }>(
      `SELECT m.id::text, ct.phone, ct.name, m.status, m.skip_reason, m.error, m.rendered,
              COALESCE(m.sent_at, m.attempted_at)::text AS at, m.replied_at IS NOT NULL AS replied,
              to_jsonb(m)->>'reply_text' AS reply_text, to_jsonb(m)->>'followup_status' AS followup_status,
              to_jsonb(m)->>'followup_rendered' AS followup_rendered, COALESCE((to_jsonb(m)->>'cold')::boolean, false) AS cold
         FROM broadcast_messages m JOIN broadcast_contacts ct ON ct.id = m.contact_id
        WHERE m.campaign_id = $1 AND m.status <> 'pending'
        ORDER BY COALESCE(m.sent_at, m.attempted_at) DESC NULLS LAST LIMIT 25`,
      [id],
    ),
    listEvents(id, 15),
  ])
  return { skips: skips.rows, recent: recent.rows, events }
}

export async function listEvents(campaignId: string | null, limit = 12) {
  const { rows } = await pool.query<{ id: string; kind: string; detail: string | null; created_at: string; campaign: string | null }>(
    `SELECT e.id::text, e.kind, e.detail, e.created_at::text, c.name AS campaign
       FROM broadcast_events e LEFT JOIN broadcast_campaigns c ON c.id = e.campaign_id
      WHERE ($1::bigint IS NULL OR e.campaign_id = $1)
      ORDER BY e.created_at DESC LIMIT $2`,
    [campaignId, limit],
  )
  return rows
}

export async function contactStats(cooldownDays: number) {
  const { rows } = await pool.query<{ total: number; eligible: number; opted_out: number; invalid: number; replied: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE NOT opted_out AND wa_exists IS NOT FALSE
                               AND (last_sent_at IS NULL OR last_sent_at < now() - make_interval(days => $1)))::int AS eligible,
            COUNT(*) FILTER (WHERE opted_out)::int AS opted_out,
            COUNT(*) FILTER (WHERE wa_exists IS FALSE)::int AS invalid,
            COUNT(*) FILTER (WHERE last_reply_at IS NOT NULL)::int AS replied
       FROM broadcast_contacts`,
    [cooldownDays],
  )
  return rows[0] ?? { total: 0, eligible: 0, opted_out: 0, invalid: 0, replied: 0 }
}

export async function listTags() {
  const { rows } = await pool.query<{ tag: string; n: number }>(
    `SELECT t AS tag, COUNT(*)::int AS n FROM broadcast_contacts, unnest(tags) t GROUP BY t ORDER BY t`,
  )
  return rows
}

export type ContactRow = {
  id: string
  phone: string
  name: string | null
  tags: string[]
  opted_out: boolean
  wa_exists: boolean | null
  last_sent_at: string | null
  last_reply_at: string | null
}

export async function listContacts(q: string, filter: string) {
  const term = q.trim()
  const digits = term.replace(/\D/g, '')
  const { rows } = await pool.query<ContactRow>(
    `SELECT id::text, phone, name, tags, opted_out, wa_exists, last_sent_at::text, last_reply_at::text
       FROM broadcast_contacts
      WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR ($2 <> '' AND phone LIKE '%' || $2 || '%') OR $1 = ANY(tags))
        AND ($3 = 'all' OR ($3 = 'opted_out' AND opted_out) OR ($3 = 'invalid' AND wa_exists IS FALSE)
             OR ($3 = 'replied' AND last_reply_at IS NOT NULL))
      ORDER BY created_at DESC LIMIT 200`,
    [term, digits, filter],
  )
  return rows
}

export async function overview() {
  const settings = await loadSettings()
  const [counts, contacts, campaigns, events] = await Promise.all([
    sendCounts(),
    contactStats(settings.contact_cooldown_days),
    listCampaigns(),
    listEvents(null, 10),
  ])
  const dailyCap = effectiveDailyCap(settings)
  return { settings, counts, dailyCap, hourlyCap: hourlyCeiling(settings, dailyCap), contacts, campaigns, events }
}

import 'server-only'
import { pool } from '@/lib/db'
import { TZ } from '@/lib/broadcast/queries'
import type { BroadcastSettings } from '@/lib/broadcast/settings'

const DEDUPE_HOURS = 6

async function event(kind: string, detail: string) {
  await pool.query(`INSERT INTO broadcast_events (campaign_id, kind, detail) VALUES (NULL, $1, $2)`, [kind, detail])
}

function floorRamp(s: BroadcastSettings) {
  return Math.min(10, s.warmup_start)
}

/** Replies only count as a signal if the webhook is actually delivering them. */
export async function replyTrackingActive() {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM broadcast_messages WHERE replied_at > now() - interval '30 days') AS ok`,
  )
  return Boolean(rows[0]?.ok)
}

/**
 * Warm-up by merit: the daily limit only grows after a sending day that used most of its
 * limit, got replies and had no incident. Bad days hold or shrink it. Returns the new limit when it changed.
 */
export async function evaluateRamp(s: BroadcastSettings): Promise<number | null> {
  if (!s.warmup_enabled) return null
  const { rows } = await pool.query<{ day: string; sent: number; replied: number; opted: number; incidents: number }>(
    `WITH last AS (
       SELECT (sent_at AT TIME ZONE $1)::date AS day, COUNT(*)::int AS sent,
              COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied
         FROM broadcast_messages
        WHERE status = 'sent' AND sent_at > now() - interval '21 days'
          AND (sent_at AT TIME ZONE $1)::date < (now() AT TIME ZONE $1)::date
        GROUP BY 1 ORDER BY 1 DESC LIMIT 1
     )
     SELECT last.day::text, last.sent, last.replied,
            (SELECT COUNT(*)::int FROM broadcast_contacts
              WHERE opted_out_at IS NOT NULL AND (opted_out_at AT TIME ZONE $1)::date = last.day) AS opted,
            (SELECT COUNT(*)::int FROM broadcast_incidents
              WHERE (created_at AT TIME ZONE $1)::date >= last.day) AS incidents
       FROM last`,
    [TZ],
  )
  const d = rows[0]
  if (!d || (s.ramp_evaluated_on && d.day <= s.ramp_evaluated_on)) return null

  const ramp = s.ramp_cap ?? Math.min(s.daily_cap, s.warmup_start)
  const tracking = await replyTrackingActive()
  const replyRate = d.sent ? (d.replied / d.sent) * 100 : 0
  const optRate = d.sent ? (d.opted / d.sent) * 100 : 0
  const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

  let next = ramp
  let detail: string
  if (d.incidents > 0) {
    detail = `Houve incidente desde ${d.day}. Limite mantido em ${ramp}.`
  } else if (d.sent >= 15 && (optRate >= 5 || (tracking && s.min_reply_rate > 0 && replyRate < s.min_reply_rate / 2))) {
    next = Math.max(floorRamp(s), Math.round(ramp * 0.8))
    detail = `Dia ${d.day}: ${d.sent} envios, ${pct(replyRate)} de resposta e ${pct(optRate)} de descadastro. Sinal ruim: limite reduzido de ${ramp} para ${next}.`
  } else if (d.sent < Math.ceil(ramp * 0.7)) {
    detail = `Dia ${d.day}: ${d.sent} de ${ramp} envios. Só sobe quando o dia usa pelo menos 70% do limite.`
  } else if (tracking && s.min_reply_rate > 0 && replyRate < s.min_reply_rate) {
    detail = `Dia ${d.day}: ${pct(replyRate)} de resposta (mínimo ${s.min_reply_rate}%). Limite mantido em ${ramp}.`
  } else {
    const growth = Math.min(s.warmup_step, Math.max(5, Math.round(ramp * 0.25)))
    next = Math.min(s.daily_cap, ramp + growth)
    detail = `Dia ${d.day} saudável: ${d.sent} envios, ${pct(replyRate)} de resposta. Limite ${next === ramp ? `mantido em ${ramp} (teto)` : `subiu de ${ramp} para ${next}`}.`
  }

  const claim = await pool.query(
    `UPDATE broadcast_settings SET ramp_cap = $1, ramp_evaluated_on = $2::date, updated_at = now()
      WHERE id = 1 AND (ramp_evaluated_on IS NULL OR ramp_evaluated_on < $2::date)`,
    [next, d.day],
  )
  if (!claim.rowCount) return null
  await event('aquecimento', detail)
  return next
}

/**
 * A disconnect or block signal means WhatsApp flagged the number. Cut the limit, quarantine the
 * number and pause everything: sending right after reconnecting is what turns a warning into a ban.
 */
export async function recordIncident(kind: 'desconexao' | 'sinal_bloqueio', detail: string) {
  const { rows } = await pool.query<{ ramp_before: number; ramp_after: number; quarantine_until: string }>(
    `WITH cur AS (
       SELECT COALESCE(ramp_cap, LEAST(daily_cap, warmup_start)) AS ramp, warmup_start, incident_cut_pct, quarantine_hours
         FROM broadcast_settings
        WHERE id = 1 AND NOT EXISTS (
          SELECT 1 FROM broadcast_incidents WHERE created_at > now() - make_interval(hours => $3))
     ), ins AS (
       INSERT INTO broadcast_incidents (kind, detail, ramp_before, ramp_after, quarantine_until)
       SELECT $1, $2, ramp,
              GREATEST(LEAST(10, warmup_start), round(ramp * (100 - incident_cut_pct) / 100.0)::int),
              now() + make_interval(hours => quarantine_hours)
         FROM cur
       RETURNING ramp_before, ramp_after, quarantine_until
     )
     UPDATE broadcast_settings s
        SET ramp_cap = ins.ramp_after, quarantine_until = ins.quarantine_until, updated_at = now()
       FROM ins WHERE s.id = 1
     RETURNING ins.ramp_before, ins.ramp_after, ins.quarantine_until::text`,
    [kind, detail.slice(0, 500), DEDUPE_HOURS],
  )
  await pool.query(`UPDATE broadcast_campaigns SET status = 'paused', pause_reason = 'incidente' WHERE status = 'running'`)
  const r = rows[0]
  if (!r) return
  const until = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(r.quarantine_until),
  )
  await event(
    'incidente',
    `${kind === 'desconexao' ? 'WhatsApp desconectado' : 'Sinal de bloqueio'}. Limite diário cortado de ${r.ramp_before} para ${r.ramp_after} e quarentena até ${until}. ${detail.slice(0, 200)}`,
  )
}

/** Stores the connection state; a transition into "close" is an incident. */
export async function noteConnectionState(state: string, source: string) {
  const { rows } = await pool.query<{ prev: string | null }>(
    `UPDATE broadcast_settings s SET last_state = $1, last_state_at = now()
       FROM (SELECT last_state AS prev FROM broadcast_settings WHERE id = 1) p
      WHERE s.id = 1 AND s.last_state IS DISTINCT FROM $1
      RETURNING p.prev`,
    [state],
  )
  if (!rows[0]) return
  if (state === 'close') await recordIncident('desconexao', `Detectado por ${source} (estado anterior: ${rows[0].prev ?? 'desconhecido'}).`)
}

export async function listIncidents(limit = 5) {
  const { rows } = await pool
    .query<{ id: string; kind: string; detail: string | null; ramp_before: number | null; ramp_after: number | null; quarantine_until: string | null; created_at: string }>(
      `SELECT id::text, kind, detail, ramp_before, ramp_after, quarantine_until::text, created_at::text
         FROM broadcast_incidents ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    .catch(() => ({ rows: [] }))
  return rows
}

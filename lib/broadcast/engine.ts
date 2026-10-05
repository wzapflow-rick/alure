import 'server-only'
import { pool } from '@/lib/db'
import { checkWhatsAppNumbers, connectionState, EvolutionApiError, evolutionConfig, sendDirectText } from '@/lib/notify/evolution'
import { broadcastSchemaReady, loadSettings, sendCounts, TZ } from '@/lib/broadcast/queries'
import { effectiveDailyCap, type BroadcastSettings } from '@/lib/broadcast/settings'
import { renderMessage } from '@/lib/broadcast/text'

/** One tick runs at most this long; the scheduler calls again every minute. */
const TICK_BUDGET_MS = 50_000
const MAX_SKIPS_PER_TICK = 25
const NUMBER_CHECK_TTL_DAYS = 30
const QUALITY_WINDOW = 20
const BAN_SIGNAL = /logged ?out|not connected|connection closed|unauthorized|forbidden|blocked|banned|restrict/i

export function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function localClock(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return { hour: Number(parts.hour), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) }
}

export function insideWindow(s: BroadcastSettings, clock = localClock()) {
  return s.weekdays.includes(clock.weekday) && clock.hour >= s.window_start_hour && clock.hour < s.window_end_hour
}

export async function logEvent(campaignId: string | null, kind: string, detail: string | null = null) {
  await pool.query(`INSERT INTO broadcast_events (campaign_id, kind, detail) VALUES ($1, $2, $3)`, [campaignId, kind, detail])
}

async function pauseCampaign(id: string, reason: string, detail: string) {
  const { rowCount } = await pool.query(
    `UPDATE broadcast_campaigns SET status = 'paused', pause_reason = $2 WHERE id = $1 AND status = 'running'`,
    [id, reason],
  )
  if (rowCount) await logEvent(id, 'pausa_automatica', detail)
}

async function emergencyStop(campaignId: string, detail: string) {
  await pool.query(`UPDATE broadcast_settings SET paused_all = true, updated_at = now() WHERE id = 1`)
  await pauseCampaign(campaignId, 'risco_bloqueio', detail)
  await logEvent(campaignId, 'parada_emergencia', detail)
}

type Campaign = {
  id: string
  templates: string[]
  link_url: string | null
  append_link: boolean
  opt_out_footer: boolean
  next_send_at: Date | null
  batch_sent: number
  batch_target: number
  consecutive_failures: number
  last_variant: number | null
}

type Claimed = {
  id: string
  contact_id: string
  phone: string
  name: string | null
  opted_out: boolean
  wa_exists: boolean | null
  wa_fresh: boolean
  recently_sent: boolean
}

type Step =
  | { kind: 'sent' | 'failed' | 'skipped' }
  | { kind: 'wait'; until: number }
  | { kind: 'stop'; reason: string }

async function skip(messageId: string, reason: string) {
  await pool.query(`UPDATE broadcast_messages SET status = 'skipped', skip_reason = $2 WHERE id = $1`, [messageId, reason])
}

/** Recent campaign quality: too many failures or numbers without WhatsApp means a bad list, which is what gets numbers banned. */
async function qualityGuard(campaign: Campaign, s: BroadcastSettings) {
  const { rows } = await pool.query<{ total: number; failed: number; invalid: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE skip_reason = 'sem_whatsapp')::int AS invalid
       FROM (SELECT status, skip_reason FROM broadcast_messages
              WHERE campaign_id = $1 AND (status IN ('sent','failed') OR skip_reason = 'sem_whatsapp')
              ORDER BY COALESCE(sent_at, attempted_at) DESC NULLS LAST LIMIT $2) recent`,
    [campaign.id, QUALITY_WINDOW],
  )
  const q = rows[0]
  if (!q || q.total < 10) return true
  if ((q.failed / q.total) * 100 > s.max_error_rate) {
    await pauseCampaign(campaign.id, 'taxa_de_erro', `${q.failed} falhas nas últimas ${q.total} tentativas (limite ${s.max_error_rate}%).`)
    return false
  }
  if ((q.invalid / q.total) * 100 > s.max_invalid_rate) {
    await pauseCampaign(campaign.id, 'lista_ruim', `${q.invalid} de ${q.total} números recentes não têm WhatsApp (limite ${s.max_invalid_rate}%). Revise a lista.`)
    return false
  }
  return true
}

async function step(): Promise<Step> {
  const s = await loadSettings()
  if (s.paused_all) return { kind: 'stop', reason: 'paused_all' }
  if (!insideWindow(s)) return { kind: 'stop', reason: 'outside_window' }

  const { rows: campaigns } = await pool.query<Campaign>(
    `SELECT id::text, templates, link_url, append_link, opt_out_footer, next_send_at, batch_sent, batch_target,
            consecutive_failures, last_variant
       FROM broadcast_campaigns WHERE status = 'running' ORDER BY started_at LIMIT 1`,
  )
  const campaign = campaigns[0]
  if (!campaign) return { kind: 'stop', reason: 'idle' }
  if (campaign.next_send_at && campaign.next_send_at.getTime() > Date.now()) {
    return { kind: 'wait', until: campaign.next_send_at.getTime() }
  }

  const counts = await sendCounts()
  const dailyCap = effectiveDailyCap(s)
  if (counts.today >= dailyCap) return { kind: 'stop', reason: 'daily_cap' }
  if (counts.hour >= s.hourly_cap) {
    await pool.query(`UPDATE broadcast_campaigns SET next_send_at = now() + make_interval(secs => $2) WHERE id = $1`, [
      campaign.id,
      rand(300, 900),
    ])
    return { kind: 'stop', reason: 'hourly_cap' }
  }

  const state = await connectionState()
  if (state !== 'open') {
    await pauseCampaign(campaign.id, 'whatsapp_desconectado', `Instância com estado "${state}". Reconecte o WhatsApp na Evolution antes de retomar.`)
    return { kind: 'stop', reason: 'disconnected' }
  }

  const { rows: claimed } = await pool.query<Claimed>(
    `WITH next AS (
       SELECT id FROM broadcast_messages
        WHERE campaign_id = $1 AND status = 'pending'
        ORDER BY position LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     UPDATE broadcast_messages m SET status = 'sending', attempted_at = now()
       FROM next, broadcast_contacts c
      WHERE m.id = next.id AND c.id = m.contact_id
     RETURNING m.id::text, c.id::text AS contact_id, c.phone, c.name, c.opted_out, c.wa_exists,
               (c.wa_checked_at > now() - make_interval(days => $2)) AS wa_fresh,
               (c.last_sent_at > now() - make_interval(days => $3)) AS recently_sent`,
    [campaign.id, NUMBER_CHECK_TTL_DAYS, s.contact_cooldown_days],
  )
  const msg = claimed[0]
  if (!msg) {
    const { rowCount } = await pool.query(
      `UPDATE broadcast_campaigns SET status = 'completed', finished_at = now(), next_send_at = NULL
        WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM broadcast_messages WHERE campaign_id = $1 AND status IN ('pending','sending'))`,
      [campaign.id],
    )
    if (rowCount) await logEvent(campaign.id, 'concluida', 'Todos os contatos da campanha foram processados.')
    return { kind: 'stop', reason: 'completed' }
  }

  if (msg.opted_out) return skip(msg.id, 'descadastrado').then(() => ({ kind: 'skipped' as const }))
  if (msg.recently_sent) return skip(msg.id, 'contato_recente').then(() => ({ kind: 'skipped' as const }))

  if (msg.wa_exists === false && msg.wa_fresh) return skip(msg.id, 'sem_whatsapp').then(() => ({ kind: 'skipped' as const }))
  if (!msg.wa_fresh || msg.wa_exists === null) {
    try {
      const [check] = await checkWhatsAppNumbers([msg.phone])
      const exists = Boolean(check?.exists)
      await pool.query(`UPDATE broadcast_contacts SET wa_exists = $2, wa_checked_at = now() WHERE id = $1`, [msg.contact_id, exists])
      if (!exists) {
        await skip(msg.id, 'sem_whatsapp')
        return (await qualityGuard(campaign, s)) ? { kind: 'skipped' } : { kind: 'stop', reason: 'quality' }
      }
    } catch (err) {
      await pool.query(`UPDATE broadcast_messages SET status = 'pending', attempted_at = NULL WHERE id = $1`, [msg.id])
      await pool.query(`UPDATE broadcast_campaigns SET next_send_at = now() + interval '2 minutes' WHERE id = $1`, [campaign.id])
      console.error('[disparos] number check failed:', (err as Error).message)
      return { kind: 'stop', reason: 'check_failed' }
    }
  }

  const variants = campaign.templates.map((_, i) => i)
  const pool_ = variants.length > 1 ? variants.filter((i) => i !== campaign.last_variant) : variants
  const variant = pool_[Math.floor(Math.random() * pool_.length)]
  const text = renderMessage(campaign.templates[variant], {
    name: msg.name,
    hour: localClock().hour,
    link: campaign.link_url,
    appendLink: campaign.append_link,
    optOutFooter: campaign.opt_out_footer,
  })
  const typingMs = s.typing_enabled ? Math.min(9000, Math.max(2500, text.length * 35)) + rand(0, 1500) : 0

  try {
    await sendDirectText(msg.phone, text, { typingMs, linkPreview: true })
  } catch (err) {
    const message = (err as Error).message.slice(0, 500)
    await pool.query(`UPDATE broadcast_messages SET status = 'failed', error = $2, variant = $3, rendered = $4 WHERE id = $1`, [
      msg.id,
      message,
      variant,
      text,
    ])
    const failures = campaign.consecutive_failures + 1
    await pool.query(
      `UPDATE broadcast_campaigns SET consecutive_failures = $2, next_send_at = now() + make_interval(secs => $3) WHERE id = $1`,
      [campaign.id, failures, rand(s.min_delay_s, s.max_delay_s)],
    )
    const status = err instanceof EvolutionApiError ? err.status : 0
    if (status === 401 || status === 403 || BAN_SIGNAL.test(message)) {
      await emergencyStop(campaign.id, `A Evolution respondeu com sinal de bloqueio/desconexão: ${message.slice(0, 200)}`)
      return { kind: 'stop', reason: 'emergency' }
    }
    if (failures >= s.max_consecutive_failures) {
      await pauseCampaign(campaign.id, 'falhas_seguidas', `${failures} falhas seguidas. Último erro: ${message.slice(0, 200)}`)
      return { kind: 'stop', reason: 'failures' }
    }
    return (await qualityGuard(campaign, s)) ? { kind: 'failed' } : { kind: 'stop', reason: 'quality' }
  }

  await pool.query(
    `UPDATE broadcast_messages SET status = 'sent', sent_at = now(), variant = $2, rendered = $3, error = NULL WHERE id = $1`,
    [msg.id, variant, text],
  )
  await pool.query(`UPDATE broadcast_contacts SET last_sent_at = now() WHERE id = $1`, [msg.contact_id])

  const batchSent = campaign.batch_sent + 1
  let delay = rand(s.min_delay_s, s.max_delay_s)
  let batchTarget = campaign.batch_target
  let nextBatchSent = batchSent
  if (batchSent >= campaign.batch_target) {
    delay = rand(s.batch_pause_min_s, s.batch_pause_max_s)
    batchTarget = rand(s.batch_min, s.batch_max)
    nextBatchSent = 0
    await logEvent(campaign.id, 'pausa_lote', `Lote de ${batchSent} enviado. Pausa de ${Math.round(delay / 60)} min; próximo lote: ${batchTarget}.`)
  } else if (Math.random() * 100 < s.long_break_chance) {
    delay += rand(180, 600)
  }

  await pool.query(
    `UPDATE broadcast_campaigns
        SET batch_sent = $2, batch_target = $3, last_variant = $4, consecutive_failures = 0,
            next_send_at = now() + make_interval(secs => $5)
      WHERE id = $1`,
    [campaign.id, nextBatchSent, batchTarget, variant, delay],
  )
  return { kind: 'sent' }
}

export type TickResult = { status: string; sent: number; failed: number; skipped: number }

/**
 * Lease row instead of advisory locks: PgBouncer in transaction mode can't hold session locks,
 * and two overlapping ticks would double the sending rate.
 */
export async function runBroadcastTick(): Promise<TickResult> {
  const result: TickResult = { status: 'idle', sent: 0, failed: 0, skipped: 0 }
  if (!evolutionConfig()) return { ...result, status: 'not_configured' }
  if (!(await broadcastSchemaReady())) return { ...result, status: 'missing_schema' }

  const lease = await pool.query(
    `UPDATE broadcast_settings SET tick_lock_until = now() + interval '75 seconds', last_tick_at = now()
      WHERE id = 1 AND (tick_lock_until IS NULL OR tick_lock_until < now())`,
  )
  if (!lease.rowCount) return { ...result, status: 'busy' }

  const started = Date.now()
  try {
    // A message stuck in "sending" may already have been delivered; never resend it.
    await pool.query(
      `UPDATE broadcast_messages SET status = 'failed', error = 'Envio interrompido; não reenviado por segurança.'
        WHERE status = 'sending' AND attempted_at < now() - interval '5 minutes'`,
    )
    while (Date.now() - started < TICK_BUDGET_MS) {
      const s = await step()
      if (s.kind === 'sent') result.sent++
      else if (s.kind === 'failed') result.failed++
      else if (s.kind === 'skipped') {
        if (++result.skipped >= MAX_SKIPS_PER_TICK) return { ...result, status: 'skip_limit' }
      } else if (s.kind === 'wait') {
        const ms = s.until - Date.now()
        if (Date.now() - started + ms > TICK_BUDGET_MS) return { ...result, status: 'waiting' }
        if (ms > 0) await sleep(ms)
      } else if (s.kind === 'stop') return { ...result, status: s.reason }
    }
    return { ...result, status: 'budget' }
  } finally {
    await pool.query(`UPDATE broadcast_settings SET tick_lock_until = NULL WHERE id = 1`)
  }
}

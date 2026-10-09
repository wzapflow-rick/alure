import 'server-only'
import { pool } from '@/lib/db'
import { checkWhatsAppNumbers, connectionState, EvolutionApiError, evolutionServerConfig, markMessageRead, sendDirectText } from '@/lib/notify/evolution'
import { broadcastSchemaReady, COLD_CONTACT_SQL, loadSettings, sendCounts, TZ } from '@/lib/broadcast/queries'
import { effectiveDailyCap, hourlyCeiling, quarantineActive, type BroadcastSettings } from '@/lib/broadcast/settings'
import { evaluateRamp, logEvent, noteConnectionState, recordIncident, replyTrackingActive, type Scope } from '@/lib/broadcast/health'
import { renderMessage } from '@/lib/broadcast/text'
import { resolveInstanceName } from '@/lib/notify/evolution'

export { logEvent }

/** One tick runs at most this long; the scheduler calls again every minute. */
const TICK_BUDGET_MS = 50_000
const MAX_SKIPS_PER_TICK = 25
const NUMBER_CHECK_TTL_DAYS = 30
const QUALITY_WINDOW = 20
/** Repeated send failures put the number in a short quarantine instead of hammering a struggling session. */
const FAILURE_QUARANTINE_HOURS = 2
const BAN_SIGNAL = /logged ?out|not connected|connection closed|unauthorized|forbidden|blocked|banned|restrict/i

export function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

/** Human gaps are not uniform: mostly near the middle, sometimes long. Averages of two draws give that bell shape. */
export function humanDelay(min: number, max: number) {
  const a = rand(min, max)
  const b = rand(min, max)
  return Math.round((a + b) / 2)
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

type Ctx = Scope & { instanceId: string; evo: string; companyName: string }

async function pauseCampaign(ctx: Ctx, id: string, reason: string, detail: string) {
  const { rowCount } = await pool.query(
    `UPDATE broadcast_campaigns SET status = 'paused', pause_reason = $2 WHERE id = $1 AND status = 'running'`,
    [id, reason],
  )
  if (rowCount) await logEvent(ctx, id, 'pausa_automatica', detail)
}

async function emergencyStop(ctx: Ctx, campaignId: string, detail: string) {
  await pool.query(`UPDATE broadcast_settings SET paused_all = true, updated_at = now() WHERE id = $1`, [ctx.instanceId])
  await pauseCampaign(ctx, campaignId, 'risco_bloqueio', detail)
  await logEvent(ctx, campaignId, 'parada_emergencia', detail)
  await recordIncident(ctx, 'sinal_bloqueio', detail).catch((e) => console.error('[disparos] incident:', (e as Error).message))
}

/**
 * Cold lists are what get numbers flagged: many messages that nobody answers.
 * Only enforced once the webhook has proven it delivers replies for this number.
 */
async function replyGuard(ctx: Ctx, campaign: Campaign, s: BroadcastSettings) {
  if (s.min_reply_rate <= 0) return true
  const { rows } = await pool.query<{ sent: number; replied: number }>(
    `SELECT COUNT(*)::int AS sent, COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied
       FROM broadcast_messages
      WHERE campaign_id = $1 AND status = 'sent'
        AND sent_at < now() - interval '2 hours' AND sent_at > now() - interval '3 days'`,
    [campaign.id],
  )
  const r = rows[0]
  if (!r || r.sent < 30) return true
  if ((r.replied / r.sent) * 100 >= s.min_reply_rate) return true
  if (!(await replyTrackingActive(ctx.instanceId))) return true
  await pauseCampaign(
    ctx,
    campaign.id,
    'baixa_resposta',
    `Só ${r.replied} de ${r.sent} contatos responderam (mínimo ${s.min_reply_rate}%). Mensagem sem resposta em massa é o principal motivo de queda do número. Troque a lista ou a abordagem.`,
  )
  return false
}

type RenderCtx = {
  name: string | null
  link: string | null
  appendLink: boolean
  optOutFooter: boolean
  company: string
  vars: Record<string, string>
}

/** Identical texts sent to many people is a bulk fingerprint; re-sorts until the text was not sent by this number in 14 days. */
async function renderUnique(ctx: Ctx, templates: string[], render: RenderCtx, avoidVariant: number | null) {
  const all = templates.map((_, i) => i)
  const choices = all.length > 1 && avoidVariant !== null ? all.filter((i) => i !== avoidVariant) : all
  let result = { variant: 0, text: '' }
  for (let attempt = 0; attempt < 6; attempt++) {
    const variant = choices[Math.floor(Math.random() * choices.length)]
    result = { variant, text: renderMessage(templates[variant], { ...render, hour: localClock().hour }) }
    const { rowCount } = await pool.query(
      `SELECT 1 FROM broadcast_messages m JOIN broadcast_campaigns cp ON cp.id = m.campaign_id
        WHERE cp.instance_id = $2
          AND ((md5(m.rendered) = md5($1) AND m.sent_at > now() - interval '14 days')
            OR (md5(m.followup_rendered) = md5($1) AND m.followup_sent_at > now() - interval '14 days'))
        LIMIT 1`,
      [result.text, ctx.instanceId],
    )
    if (!rowCount) break
  }
  return result
}

/** "digitando…" proportional to the text, like a person typing it. */
function typingFor(text: string, s: BroadcastSettings, min = 2500, max = 9000) {
  return s.typing_enabled ? Math.min(max, Math.max(min, text.length * 35)) + rand(0, 1500) : 0
}

type FollowClaim = {
  id: string
  campaign_id: string
  phone: string
  name: string | null
  vars: Record<string, string>
  opted_out: boolean
  reply_key_id: string | null
  followup_templates: string[]
  link_url: string | null
  append_link: boolean
}

/**
 * Second step of a two-step campaign: the offer (with link) goes only to people who answered the opener.
 * Answering someone who wrote back is the most natural thing a number can do, so it runs before new openers.
 */
async function followupStep(ctx: Ctx, s: BroadcastSettings): Promise<Step | null> {
  await pool.query(
    `UPDATE broadcast_messages m SET followup_status = 'skipped', followup_error = 'Resposta antiga demais; oferta não enviada.'
       FROM broadcast_campaigns cp
      WHERE cp.id = m.campaign_id AND cp.instance_id = $1
        AND m.followup_status = 'pending' AND m.followup_due_at < now() - interval '48 hours'`,
    [ctx.instanceId],
  )
  const { rows } = await pool.query<FollowClaim>(
    `WITH next AS (
       SELECT m.id FROM broadcast_messages m JOIN broadcast_campaigns cp ON cp.id = m.campaign_id
        WHERE cp.instance_id = $1 AND m.followup_status = 'pending' AND m.followup_due_at <= now() AND cp.status <> 'cancelled'
        ORDER BY m.followup_due_at LIMIT 1 FOR UPDATE OF m SKIP LOCKED
     )
     UPDATE broadcast_messages m SET followup_status = 'sending'
       FROM next, broadcast_contacts c, broadcast_campaigns cp
      WHERE m.id = next.id AND c.id = m.contact_id AND cp.id = m.campaign_id
     RETURNING m.id::text, m.campaign_id::text, c.phone, c.name, c.vars, c.opted_out, m.reply_key_id,
               cp.followup_templates, cp.link_url, cp.append_link`,
    [ctx.instanceId],
  )
  const f = rows[0]
  if (!f) return null
  if (f.opted_out || !f.followup_templates.length) {
    await pool.query(`UPDATE broadcast_messages SET followup_status = 'skipped' WHERE id = $1`, [f.id])
    return { kind: 'skipped' }
  }

  const state = await connectionState(ctx.evo)
  if (state !== 'open') {
    await pool.query(`UPDATE broadcast_messages SET followup_status = 'pending' WHERE id = $1`, [f.id])
    if (state !== 'unknown') await noteConnectionState(ctx, state, 'verificação antes da oferta').catch(() => {})
    return { kind: 'stop', reason: 'disconnected' }
  }

  if (f.reply_key_id) await markMessageRead(f.phone, f.reply_key_id, ctx.evo).catch(() => {})
  await sleep(rand(1500, 4000))

  const { text } = await renderUnique(
    ctx,
    f.followup_templates,
    { name: f.name, link: f.link_url, appendLink: f.append_link, optOutFooter: false, company: ctx.companyName, vars: f.vars ?? {} },
    null,
  )
  try {
    await sendDirectText(f.phone, text, { typingMs: typingFor(text, s, 4000, 12000), linkPreview: true, instance: ctx.evo })
  } catch (err) {
    const message = (err as Error).message.slice(0, 500)
    await pool.query(`UPDATE broadcast_messages SET followup_status = 'failed', followup_error = $2 WHERE id = $1`, [f.id, message])
    const status = err instanceof EvolutionApiError ? err.status : 0
    if (status === 401 || status === 403 || BAN_SIGNAL.test(message)) {
      await emergencyStop(ctx, f.campaign_id, `A Evolution respondeu com sinal de bloqueio/desconexão ao enviar uma oferta: ${message.slice(0, 200)}`)
      return { kind: 'stop', reason: 'emergency' }
    }
    return { kind: 'failed' }
  }
  await pool.query(
    `UPDATE broadcast_messages SET followup_status = 'sent', followup_sent_at = now(), followup_rendered = $2, followup_error = NULL WHERE id = $1`,
    [f.id, text],
  )
  // Keeps a gap before the next opener so the number never fires two messages back to back.
  await pool.query(
    `UPDATE broadcast_campaigns SET next_send_at = GREATEST(COALESCE(next_send_at, now()), now() + make_interval(secs => $1))
      WHERE status = 'running' AND instance_id = $2`,
    [rand(45, 120), ctx.instanceId],
  )
  return { kind: 'sent' }
}

type Campaign = {
  id: string
  two_step: boolean
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
  vars: Record<string, string>
  opted_out: boolean
  wa_exists: boolean | null
  wa_fresh: boolean
  recently_sent: boolean
  cold: boolean
}

type Step =
  | { kind: 'sent' | 'failed' | 'skipped' }
  | { kind: 'wait'; until: number }
  | { kind: 'stop'; reason: string }

async function skip(messageId: string, reason: string) {
  await pool.query(`UPDATE broadcast_messages SET status = 'skipped', skip_reason = $2 WHERE id = $1`, [messageId, reason])
}

/** Recent campaign quality: too many failures or numbers without WhatsApp means a bad list, which is what gets numbers banned. */
async function qualityGuard(ctx: Ctx, campaign: Campaign, s: BroadcastSettings) {
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
    await pauseCampaign(ctx, campaign.id, 'taxa_de_erro', `${q.failed} falhas nas últimas ${q.total} tentativas (limite ${s.max_error_rate}%).`)
    return false
  }
  if ((q.invalid / q.total) * 100 > s.max_invalid_rate) {
    await pauseCampaign(ctx, campaign.id, 'lista_ruim', `${q.invalid} de ${q.total} números recentes não têm WhatsApp (limite ${s.max_invalid_rate}%). Revise a lista.`)
    return false
  }
  return true
}

async function step(ctx: Ctx): Promise<Step> {
  const s = await loadSettings(ctx.instanceId)
  if (s.paused_all) return { kind: 'stop', reason: 'paused_all' }
  if (quarantineActive(s)) return { kind: 'stop', reason: 'quarantine' }
  if (!insideWindow(s)) return { kind: 'stop', reason: 'outside_window' }

  const followup = await followupStep(ctx, s)
  if (followup) return followup

  const { rows: campaigns } = await pool.query<Campaign>(
    `SELECT id::text, two_step, templates, link_url, append_link, opt_out_footer, next_send_at, batch_sent, batch_target,
            consecutive_failures, last_variant
       FROM broadcast_campaigns WHERE status = 'running' AND instance_id = $1 ORDER BY started_at LIMIT 1`,
    [ctx.instanceId],
  )
  const campaign = campaigns[0]
  if (!campaign) return { kind: 'stop', reason: 'idle' }
  if (campaign.next_send_at && campaign.next_send_at.getTime() > Date.now()) {
    return { kind: 'wait', until: campaign.next_send_at.getTime() }
  }

  const ramp = await evaluateRamp(ctx, s).catch((e) => {
    console.error('[disparos] ramp:', (e as Error).message)
    return null
  })
  if (ramp !== null) s.ramp_cap = ramp

  const counts = await sendCounts(ctx.instanceId)
  const dailyCap = effectiveDailyCap(s)
  if (counts.today >= dailyCap) return { kind: 'stop', reason: 'daily_cap' }
  if (counts.hour >= hourlyCeiling(s, dailyCap)) {
    await pool.query(`UPDATE broadcast_campaigns SET next_send_at = now() + make_interval(secs => $2) WHERE id = $1`, [
      campaign.id,
      rand(300, 900),
    ])
    return { kind: 'stop', reason: 'hourly_cap' }
  }

  const state = await connectionState(ctx.evo)
  if (state !== 'unknown') {
    await noteConnectionState(ctx, state, 'verificação antes do envio').catch((e) => console.error('[disparos] state:', (e as Error).message))
  }
  if (state !== 'open') {
    await pauseCampaign(ctx, campaign.id, 'whatsapp_desconectado', `Número com estado "${state}". Reconecte o WhatsApp em Números antes de retomar.`)
    return { kind: 'stop', reason: 'disconnected' }
  }

  // Cold contacts never take the whole day: warm ones (who already talked to us) keep the number's reputation up.
  const coldCap = Math.max(1, Math.floor((dailyCap * s.cold_share_pct) / 100))
  const allowCold = counts.cold_today < coldCap

  const { rows: claimed } = await pool.query<Claimed>(
    `WITH next AS (
       SELECT m.id FROM broadcast_messages m JOIN broadcast_contacts c ON c.id = m.contact_id
        WHERE m.campaign_id = $1 AND m.status = 'pending' AND ($4::boolean OR NOT ${COLD_CONTACT_SQL})
        ORDER BY m.position LIMIT 1 FOR UPDATE OF m SKIP LOCKED
     )
     UPDATE broadcast_messages m SET status = 'sending', attempted_at = now()
       FROM next, broadcast_contacts c
      WHERE m.id = next.id AND c.id = m.contact_id
     RETURNING m.id::text, c.id::text AS contact_id, c.phone, c.name, c.vars, c.opted_out, c.wa_exists,
               (c.wa_checked_at > now() - make_interval(days => $2)) AS wa_fresh,
               (c.last_sent_at > now() - make_interval(days => $3)) AS recently_sent,
               ${COLD_CONTACT_SQL} AS cold`,
    [campaign.id, NUMBER_CHECK_TTL_DAYS, s.contact_cooldown_days, allowCold],
  )
  const msg = claimed[0]
  if (!msg) {
    const { rowCount } = await pool.query(
      `UPDATE broadcast_campaigns SET status = 'completed', finished_at = now(), next_send_at = NULL
        WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM broadcast_messages WHERE campaign_id = $1 AND status IN ('pending','sending'))`,
      [campaign.id],
    )
    if (rowCount) {
      await logEvent(ctx, campaign.id, 'concluida', 'Todos os contatos da campanha foram processados.')
      return { kind: 'stop', reason: 'completed' }
    }
    if (!allowCold) {
      const { rowCount: logged } = await pool.query(
        `SELECT 1 FROM broadcast_events WHERE campaign_id = $1 AND kind = 'cota_fria'
            AND created_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
        [campaign.id, TZ],
      )
      if (!logged) {
        await logEvent(ctx, campaign.id, 'cota_fria', `${counts.cold_today} contatos frios hoje (cota de ${coldCap}). O restante segue amanhã.`)
      }
      return { kind: 'stop', reason: 'cold_cap' }
    }
    return { kind: 'stop', reason: 'idle' }
  }

  if (msg.opted_out) return skip(msg.id, 'descadastrado').then(() => ({ kind: 'skipped' as const }))
  if (msg.recently_sent) return skip(msg.id, 'contato_recente').then(() => ({ kind: 'skipped' as const }))
  if (msg.cold && !campaign.two_step && s.cold_require_two_step) {
    return skip(msg.id, 'frio_sem_duas_etapas').then(() => ({ kind: 'skipped' as const }))
  }

  if (msg.wa_exists === false && msg.wa_fresh) return skip(msg.id, 'sem_whatsapp').then(() => ({ kind: 'skipped' as const }))
  if (!msg.wa_fresh || msg.wa_exists === null) {
    try {
      const [check] = await checkWhatsAppNumbers([msg.phone], ctx.evo)
      const exists = Boolean(check?.exists)
      await pool.query(`UPDATE broadcast_contacts SET wa_exists = $2, wa_checked_at = now() WHERE id = $1`, [msg.contact_id, exists])
      if (!exists) {
        await skip(msg.id, 'sem_whatsapp')
        return (await qualityGuard(ctx, campaign, s)) ? { kind: 'skipped' } : { kind: 'stop', reason: 'quality' }
      }
    } catch (err) {
      await pool.query(`UPDATE broadcast_messages SET status = 'pending', attempted_at = NULL WHERE id = $1`, [msg.id])
      await pool.query(`UPDATE broadcast_campaigns SET next_send_at = now() + interval '2 minutes' WHERE id = $1`, [campaign.id])
      console.error('[disparos] number check failed:', (err as Error).message)
      return { kind: 'stop', reason: 'check_failed' }
    }
  }

  // Two-step openers never carry a link: links in a first message to a stranger are the classic spam signal.
  const linkAllowed = !campaign.two_step
  const { variant, text } = await renderUnique(
    ctx,
    campaign.templates,
    {
      name: msg.name,
      link: linkAllowed ? campaign.link_url : null,
      appendLink: linkAllowed && campaign.append_link,
      optOutFooter: campaign.opt_out_footer,
      company: ctx.companyName,
      vars: msg.vars ?? {},
    },
    campaign.last_variant,
  )
  const typingMs = typingFor(text, s)

  try {
    await sendDirectText(msg.phone, text, { typingMs, linkPreview: linkAllowed && !msg.cold, instance: ctx.evo })
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
      [campaign.id, failures, humanDelay(s.min_delay_s, s.max_delay_s)],
    )
    const status = err instanceof EvolutionApiError ? err.status : 0
    if (status === 401 || status === 403 || BAN_SIGNAL.test(message)) {
      await emergencyStop(ctx, campaign.id, `A Evolution respondeu com sinal de bloqueio/desconexão: ${message.slice(0, 200)}`)
      return { kind: 'stop', reason: 'emergency' }
    }
    if (failures >= s.max_consecutive_failures) {
      await pauseCampaign(ctx, campaign.id, 'falhas_seguidas', `${failures} falhas seguidas. Último erro: ${message.slice(0, 200)}`)
      await recordIncident(ctx, 'falhas_seguidas', `${failures} falhas seguidas: ${message.slice(0, 150)}`, FAILURE_QUARANTINE_HOURS).catch(() => {})
      return { kind: 'stop', reason: 'failures' }
    }
    return (await qualityGuard(ctx, campaign, s)) ? { kind: 'failed' } : { kind: 'stop', reason: 'quality' }
  }

  await pool.query(
    `UPDATE broadcast_messages SET status = 'sent', sent_at = now(), variant = $2, rendered = $3, error = NULL, cold = $4 WHERE id = $1`,
    [msg.id, variant, text, msg.cold],
  )
  await pool.query(`UPDATE broadcast_contacts SET last_sent_at = now() WHERE id = $1`, [msg.contact_id])

  const batchSent = campaign.batch_sent + 1
  const coldFactor = msg.cold ? 1 + s.cold_delay_pct / 100 : 1
  let delay = Math.round(humanDelay(s.min_delay_s, s.max_delay_s) * coldFactor)
  let batchTarget = campaign.batch_target
  let nextBatchSent = batchSent
  if (batchSent >= campaign.batch_target) {
    delay = rand(s.batch_pause_min_s, s.batch_pause_max_s)
    batchTarget = rand(s.batch_min, s.batch_max)
    nextBatchSent = 0
    await logEvent(ctx, campaign.id, 'pausa_lote', `Lote de ${batchSent} enviado. Pausa de ${Math.round(delay / 60)} min; próximo lote: ${batchTarget}.`)
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
  if (!(await replyGuard(ctx, campaign, s))) return { kind: 'stop', reason: 'low_replies' }
  return { kind: 'sent' }
}

export type TickResult = { status: string; sent: number; failed: number; skipped: number; numbers: number }

/**
 * Each number has its own lease row: PgBouncer in transaction mode can't hold session locks,
 * and two overlapping ticks would double that number's sending rate. Numbers take turns inside the tick.
 */
export async function runBroadcastTick(): Promise<TickResult> {
  const result: TickResult = { status: 'idle', sent: 0, failed: 0, skipped: 0, numbers: 0 }
  if (!evolutionServerConfig()) return { ...result, status: 'not_configured' }
  if (!(await broadcastSchemaReady())) return { ...result, status: 'missing_schema_021' }

  const { rows: active } = await pool.query<{ id: string; company_id: string; company_name: string; name: string | null }>(
    `SELECT i.id::text, i.company_id::text, c.name AS company_name, i.name
       FROM dsp_instances i JOIN dsp_companies c ON c.id = i.company_id AND c.active
      WHERE i.deleted_at IS NULL
        AND (EXISTS (SELECT 1 FROM broadcast_campaigns cp WHERE cp.instance_id = i.id AND cp.status = 'running')
          OR EXISTS (SELECT 1 FROM broadcast_messages m JOIN broadcast_campaigns cp ON cp.id = m.campaign_id
                      WHERE cp.instance_id = i.id AND m.followup_status = 'pending'))`,
  )
  if (!active.length) return result

  const leased: Ctx[] = []
  for (const row of active) {
    await pool.query(`INSERT INTO broadcast_settings (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [row.id])
    const lease = await pool.query(
      `UPDATE broadcast_settings SET tick_lock_until = now() + interval '75 seconds', last_tick_at = now()
        WHERE id = $1 AND (tick_lock_until IS NULL OR tick_lock_until < now())`,
      [row.id],
    )
    if (lease.rowCount) {
      leased.push({ companyId: row.company_id, instanceId: row.id, evo: resolveInstanceName(row.name), companyName: row.company_name })
    }
  }
  if (!leased.length) return { ...result, status: 'busy' }
  result.numbers = leased.length

  const started = Date.now()
  const done = new Set<string>()
  const waitUntil = new Map<string, number>()
  const skips = new Map<string, number>()
  try {
    const ids = leased.map((c) => c.instanceId)
    // A message stuck in "sending" may already have been delivered; never resend it.
    await pool.query(
      `UPDATE broadcast_messages m SET status = 'failed', error = 'Envio interrompido; não reenviado por segurança.'
         FROM broadcast_campaigns cp
        WHERE cp.id = m.campaign_id AND cp.instance_id = ANY($1::bigint[])
          AND m.status = 'sending' AND m.attempted_at < now() - interval '5 minutes'`,
      [ids],
    )
    await pool.query(
      `UPDATE broadcast_messages m SET followup_status = 'failed', followup_error = 'Envio interrompido; não reenviado por segurança.'
         FROM broadcast_campaigns cp
        WHERE cp.id = m.campaign_id AND cp.instance_id = ANY($1::bigint[])
          AND m.followup_status = 'sending' AND m.followup_due_at < now() - interval '5 minutes'`,
      [ids],
    )

    while (Date.now() - started < TICK_BUDGET_MS && done.size < leased.length) {
      let ran = false
      let soonest = Infinity
      for (const ctx of leased) {
        if (done.has(ctx.instanceId)) continue
        const until = waitUntil.get(ctx.instanceId) ?? 0
        if (until > Date.now()) {
          soonest = Math.min(soonest, until)
          continue
        }
        ran = true
        const r = await step(ctx).catch((e) => {
          console.error('[disparos] step failed', ctx.instanceId, (e as Error).message)
          return { kind: 'stop', reason: 'error' } as Step
        })
        if (r.kind === 'sent') result.sent++
        else if (r.kind === 'failed') result.failed++
        else if (r.kind === 'skipped') {
          result.skipped++
          const n = (skips.get(ctx.instanceId) ?? 0) + 1
          skips.set(ctx.instanceId, n)
          if (n >= MAX_SKIPS_PER_TICK) done.add(ctx.instanceId)
        } else if (r.kind === 'wait') {
          if (Date.now() - started + (r.until - Date.now()) > TICK_BUDGET_MS) done.add(ctx.instanceId)
          else waitUntil.set(ctx.instanceId, r.until)
        } else done.add(ctx.instanceId)
      }
      if (!ran && soonest !== Infinity) {
        const ms = soonest - Date.now()
        if (Date.now() - started + ms > TICK_BUDGET_MS) break
        if (ms > 0) await sleep(ms)
      }
    }
    return { ...result, status: done.size >= leased.length ? 'done' : 'budget' }
  } finally {
    await pool.query(`UPDATE broadcast_settings SET tick_lock_until = NULL WHERE id = ANY($1::bigint[])`, [leased.map((c) => c.instanceId)])
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { pool } from '@/lib/db'
import { authed, failure, type ActionState } from '@/lib/actions/shared'
import { logEvent, rand, localClock } from '@/lib/broadcast/engine'
import { loadSettings } from '@/lib/broadcast/queries'
import { quarantineActive, settingsSchema } from '@/lib/broadcast/settings'
import { countCombinations, normalizePhone, parseContactList, renderMessage } from '@/lib/broadcast/text'
import { sendDirectText } from '@/lib/notify/evolution'

const MIN_VARIATIONS = 3
const MAX_IMPORT = 5000
const MAX_RECIPIENTS = 5000

function refresh() {
  revalidatePath('/disparos', 'layout')
}

const idSchema = z.string().regex(/^\d+$/, 'Campanha inválida.')

export async function saveProtectionSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>
    const v = settingsSchema.parse({
      ...raw,
      weekdays: fd.getAll('weekdays'),
      warmup_enabled: fd.get('warmup_enabled') === 'on',
      typing_enabled: fd.get('typing_enabled') === 'on',
      cold_require_two_step: fd.get('cold_require_two_step') === 'on',
      opt_out_keywords: String(raw.opt_out_keywords ?? '').split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
    })
    await pool.query(
      `UPDATE broadcast_settings SET
         min_delay_s = $1, max_delay_s = $2, batch_min = $3, batch_max = $4, batch_pause_min_s = $5, batch_pause_max_s = $6,
         long_break_chance = $7, hourly_cap = $8, daily_cap = $9, window_start_hour = $10, window_end_hour = $11,
         weekdays = $12::smallint[], warmup_enabled = $13, warmup_start = $14, warmup_step = $15, contact_cooldown_days = $16,
         max_consecutive_failures = $17, max_error_rate = $18, max_invalid_rate = $19, typing_enabled = $20,
         opt_out_keywords = $21::text[], quarantine_hours = $22, incident_cut_pct = $23, min_reply_rate = $24,
         cold_share_pct = $25, cold_delay_pct = $26, cold_require_two_step = $27,
         ramp_cap = LEAST(COALESCE(ramp_cap, $14), $9), updated_at = now()
       WHERE id = 1`,
      [
        v.min_delay_s, v.max_delay_s, v.batch_min, v.batch_max, v.batch_pause_min_s, v.batch_pause_max_s,
        v.long_break_chance, v.hourly_cap, v.daily_cap, v.window_start_hour, v.window_end_hour,
        v.weekdays, v.warmup_enabled, v.warmup_start, v.warmup_step, v.contact_cooldown_days,
        v.max_consecutive_failures, v.max_error_rate, v.max_invalid_rate, v.typing_enabled, v.opt_out_keywords,
        v.quarantine_hours, v.incident_cut_pct, v.min_reply_rate,
        v.cold_share_pct, v.cold_delay_pct, v.cold_require_two_step,
      ],
    )
    await logEvent(null, 'protecoes_alteradas', 'Barreiras de proteção atualizadas.')
    refresh()
    return { ok: true, message: 'Proteções salvas.' }
  } catch (e) {
    return failure(e)
  }
}

export async function setPauseAll(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const paused = fd.get('paused') === 'true'
    await pool.query(`UPDATE broadcast_settings SET paused_all = $1, updated_at = now() WHERE id = 1`, [paused])
    await logEvent(null, paused ? 'pausa_geral' : 'retomada_geral', paused ? 'Todos os disparos foram pausados manualmente.' : 'Disparos liberados manualmente.')
    refresh()
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

export async function importContacts(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    if (fd.get('consent') !== 'on') {
      return { ok: false, message: 'Confirme que esses contatos conhecem a ALURE. Listas compradas são a causa nº 1 de banimento.' }
    }
    const tag = z.string().trim().toLowerCase().max(40).parse(String(fd.get('tag') ?? '')) || null
    const source = z.string().trim().max(80).parse(String(fd.get('source') ?? '')) || null
    const { contacts, invalid } = parseContactList(String(fd.get('list') ?? ''))
    if (!contacts.length) return { ok: false, message: 'Nenhum telefone válido encontrado.' }
    if (contacts.length > MAX_IMPORT) return { ok: false, message: `Máximo de ${MAX_IMPORT} contatos por importação.` }

    const { rows } = await pool.query<{ inserted: boolean }>(
      `INSERT INTO broadcast_contacts (phone, name, tags, source)
       SELECT phone, NULLIF(name, ''), CASE WHEN $3::text IS NULL THEN '{}'::text[] ELSE ARRAY[$3::text] END, $4
         FROM unnest($1::text[], $2::text[]) AS t(phone, name)
       ON CONFLICT (phone) DO UPDATE SET
         name = COALESCE(broadcast_contacts.name, EXCLUDED.name),
         tags = ARRAY(SELECT DISTINCT unnest(broadcast_contacts.tags || EXCLUDED.tags))
       RETURNING (xmax = 0) AS inserted`,
      [contacts.map((c) => c.phone), contacts.map((c) => c.name ?? ''), tag, source],
    )
    const created = rows.filter((r) => r.inserted).length
    refresh()
    return {
      ok: true,
      message: `${created} novos, ${rows.length - created} já existiam${invalid ? `, ${invalid} linhas ignoradas (telefone inválido)` : ''}.`,
    }
  } catch (e) {
    return failure(e)
  }
}

export async function setContactOptOut(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    const optedOut = fd.get('opted_out') === 'true'
    await pool.query(
      `UPDATE broadcast_contacts SET opted_out = $2, opted_out_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1`,
      [id, optedOut],
    )
    if (optedOut) {
      await pool.query(
        `UPDATE broadcast_messages SET status = 'skipped', skip_reason = 'descadastrado' WHERE contact_id = $1 AND status = 'pending'`,
        [id],
      )
    }
    refresh()
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

const campaignSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome à campanha.').max(80),
  templates: z
    .array(z.string().trim().max(1000, 'Cada variação pode ter até 1000 caracteres.'))
    .transform((list) => list.filter(Boolean)),
  link_url: z.string().trim().url('Link inválido.').max(500).optional().or(z.literal('')),
  tag: z.string().trim().max(40).optional(),
  max_recipients: z.coerce.number().int().min(1).max(MAX_RECIPIENTS),
})

export async function createCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string
  try {
    await authed()
    const v = campaignSchema.parse({
      name: fd.get('name'),
      templates: fd.getAll('templates').map(String),
      link_url: fd.get('link_url') ?? '',
      tag: fd.get('tag') ?? '',
      max_recipients: fd.get('max_recipients') || MAX_RECIPIENTS,
    })
    const normalized = new Set(v.templates.map((t) => t.toLowerCase().replace(/\s+/g, ' ')))
    if (normalized.size < MIN_VARIATIONS) {
      return { ok: false, message: `Escreva pelo menos ${MIN_VARIATIONS} variações diferentes. Mensagens idênticas em massa são detectadas pelo WhatsApp.` }
    }
    const combos = v.templates.reduce((sum, t) => sum + countCombinations(t), 0)
    if (combos < 10) {
      return { ok: false, message: 'Use sorteios como {Oi|Olá|Opa} para gerar pelo menos 10 textos possíveis.' }
    }
    const appendLink = fd.get('append_link') === 'on'
    const twoStep = fd.get('two_step') === 'on'
    const followups = fd
      .getAll('followup_templates')
      .map((t) => String(t).trim().slice(0, 1000))
      .filter(Boolean)
    if (twoStep) {
      if (v.templates.some((t) => /\{link\}|https?:\/\//i.test(t))) {
        return { ok: false, message: 'Em duas etapas, a abertura não pode ter link. O link vai só na oferta, para quem responder.' }
      }
      if (v.templates.some((t) => t.length > 400)) {
        return { ok: false, message: 'Abertura para lista fria deve ser curta (até 400 caracteres por variação).' }
      }
      if (new Set(followups.map((t) => t.toLowerCase())).size < 2) {
        return { ok: false, message: 'Escreva pelo menos 2 variações da oferta (a mensagem que vai para quem responder).' }
      }
      if (followups.some((t) => /\{link\}/.test(t)) && !v.link_url) return { ok: false, message: 'Informe o link usado na oferta.' }
    }
    if (appendLink && !v.link_url) return { ok: false, message: 'Informe o link do catálogo.' }
    const linkUrl = v.link_url ? v.link_url : null

    const s = await loadSettings()
    const tag = v.tag ? v.tag.toLowerCase() : null
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO broadcast_campaigns (name, templates, link_url, append_link, opt_out_footer, tag_filter, batch_target, two_step, followup_templates)
         VALUES ($1, $2::text[], $3, $4, $5, $6, $7, $8, $9::text[]) RETURNING id::text`,
        [v.name, v.templates, linkUrl, appendLink, fd.get('opt_out_footer') === 'on', tag, rand(s.batch_min, s.batch_max), twoStep, twoStep ? followups : []],
      )
      id = rows[0].id
      const audience = await client.query(
        `INSERT INTO broadcast_messages (campaign_id, contact_id, position)
         SELECT $1, c.id, row_number() OVER (ORDER BY random())
           FROM broadcast_contacts c
          WHERE NOT c.opted_out AND c.wa_exists IS NOT FALSE
            AND (c.last_sent_at IS NULL OR c.last_sent_at < now() - make_interval(days => $2))
            AND ($3::text IS NULL OR $3 = ANY(c.tags))
            AND NOT EXISTS (
              SELECT 1 FROM broadcast_messages m JOIN broadcast_campaigns oc ON oc.id = m.campaign_id
               WHERE m.contact_id = c.id AND m.status = 'pending' AND oc.status IN ('draft','running','paused'))
          ORDER BY random() LIMIT $4`,
        [id, s.contact_cooldown_days, tag, v.max_recipients],
      )
      if (!audience.rowCount) {
        await client.query('ROLLBACK')
        return { ok: false, message: 'Nenhum contato elegível (descadastrados, sem WhatsApp, recém-contatados ou já em outra campanha ficam de fora).' }
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
    await logEvent(
      id,
      'criada',
      twoStep
        ? `Campanha em duas etapas criada: ${v.templates.length} aberturas e ${followups.length} ofertas.`
        : `Campanha criada com ${v.templates.length} variações.`,
    )
  } catch (e) {
    return failure(e)
  }
  refresh()
  redirect(`/disparos/${id}`)
}

async function startOrResume(id: string) {
  const s = await loadSettings()
  if (s.paused_all) throw new Error('PAUSE_ALL')
  if (quarantineActive(s)) throw new Error('QUARANTINE')
  await pool.query(
    `UPDATE broadcast_settings SET warmup_started_on = COALESCE(warmup_started_on, (now() AT TIME ZONE 'America/Sao_Paulo')::date) WHERE id = 1`,
  )
  try {
    const { rowCount } = await pool.query(
      `UPDATE broadcast_campaigns
          SET status = 'running', pause_reason = NULL, consecutive_failures = 0,
              started_at = COALESCE(started_at, now()), next_send_at = now() + make_interval(secs => $2)
        WHERE id = $1 AND status IN ('draft','paused')`,
      [id, rand(20, 90)],
    )
    return Boolean(rowCount)
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error('ONE_RUNNING')
    throw e
  }
}

export async function startCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    const ok = await startOrResume(id)
    if (!ok) return { ok: false, message: 'Esta campanha não pode ser iniciada.' }
    await logEvent(id, 'iniciada', 'Envio liberado. O primeiro envio sai em até 2 minutos, dentro da janela permitida.')
    refresh()
    return { ok: true }
  } catch (e) {
    const m = (e as Error).message
    if (m === 'PAUSE_ALL') return { ok: false, message: 'Os disparos estão pausados globalmente. Libere no painel primeiro.' }
    if (m === 'QUARANTINE') return { ok: false, message: 'O número está em quarentena depois de um incidente. Os envios voltam sozinhos ao fim do prazo, com limite reduzido.' }
    if (m === 'ONE_RUNNING') return { ok: false, message: 'Já existe uma campanha enviando. Só uma por vez, para proteger o número.' }
    return failure(e)
  }
}

export async function pauseCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    await pool.query(`UPDATE broadcast_campaigns SET status = 'paused', pause_reason = 'manual' WHERE id = $1 AND status = 'running'`, [id])
    await logEvent(id, 'pausada', 'Pausada manualmente.')
    refresh()
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

export async function cancelCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    await pool.query(
      `UPDATE broadcast_campaigns SET status = 'cancelled', finished_at = now(), next_send_at = NULL
        WHERE id = $1 AND status IN ('draft','running','paused')`,
      [id],
    )
    await pool.query(`UPDATE broadcast_messages SET status = 'skipped', skip_reason = 'cancelada' WHERE campaign_id = $1 AND status = 'pending'`, [id])
    await logEvent(id, 'cancelada', 'Campanha cancelada; contatos pendentes liberados.')
    refresh()
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

export async function sendCampaignTest(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const id = idSchema.parse(String(fd.get('id')))
    const phone = normalizePhone(String(fd.get('phone') ?? ''))
    if (!phone) return { ok: false, message: 'Telefone inválido.' }
    const { rows } = await pool.query<{ templates: string[]; link_url: string | null; append_link: boolean; opt_out_footer: boolean }>(
      `SELECT templates, link_url, append_link, opt_out_footer FROM broadcast_campaigns WHERE id = $1`,
      [id],
    )
    const c = rows[0]
    if (!c) return { ok: false, message: 'Campanha não encontrada.' }
    const template = c.templates[Math.floor(Math.random() * c.templates.length)]
    const text = renderMessage(template, {
      name: String(fd.get('name') ?? '') || 'Teste',
      hour: localClock().hour,
      link: c.link_url,
      appendLink: c.append_link,
      optOutFooter: c.opt_out_footer,
    })
    await sendDirectText(phone, text, { typingMs: 2000 })
    return { ok: true, message: 'Teste enviado para o seu número.' }
  } catch (e) {
    const m = (e as Error).message
    if (m.startsWith('Evolution')) return { ok: false, message: m.slice(0, 200) }
    return failure(e)
  }
}

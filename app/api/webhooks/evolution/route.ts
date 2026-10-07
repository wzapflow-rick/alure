import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { pool } from '@/lib/db'
import { logEvent } from '@/lib/broadcast/engine'
import { noteConnectionState } from '@/lib/broadcast/health'

type Upsert = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string }
  message?: { conversation?: string; extendedTextMessage?: { text?: string } }
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').trim()
}

// Annoyed answers precede a report ("denúncia"); the contact is blocked forever and never gets the offer.
const HOSTILE =
  /\b(denunci\w*|spam|bloque\w*|golpe\w*|nao (me )?(mande|manda|envie|envia|chama|perturbe)|para de (mandar|me mandar|enviar)|nao tenho interesse|sem interesse|nao quero|nao conheco|quem (e|eh) (voce|vc)|quem te deu|como (conseguiu|pegou) (meu|esse) (numero|contato)|nao autorizei|procon|lgpd|chato|encher o saco|me tira|remove|remova)\b/

const HOSTILE_EMOJI = /🖕|😡|🤬|😠|👎/u

/**
 * Evolution webhook (event MESSAGES_UPSERT). Replies are a healthy signal; "SAIR" and similar
 * words opt the contact out immediately and remove them from every pending campaign.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { event?: string; data?: Upsert | Upsert[] } | null
  if (!body?.event) return NextResponse.json({ ignored: true })

  // CONNECTION_UPDATE / LOGOUT_INSTANCE: a drop is recorded the moment it happens, even with no campaign running.
  if (/connection[._]update|logout[._]instance/i.test(body.event)) {
    const raw = (body.data as { state?: string } | undefined)?.state
    const state = /logout/i.test(body.event) ? 'close' : raw
    if (state === 'open' || state === 'close' || state === 'connecting') {
      await noteConnectionState(state, 'webhook da Evolution').catch((e) => console.error('[disparos] webhook state:', (e as Error).message))
    }
    return NextResponse.json({ ok: true, state: state ?? null })
  }
  if (!/messages[._]upsert/i.test(body.event)) return NextResponse.json({ ignored: true })

  const { rows: cfg } = await pool
    .query<{ keywords: string[] }>(`SELECT opt_out_keywords AS keywords FROM broadcast_settings WHERE id = 1`)
    .catch(() => ({ rows: [] as { keywords: string[] }[] }))
  if (!cfg[0]) return NextResponse.json({ ignored: true })
  const keywords = cfg[0].keywords.map(normalize)

  const items = Array.isArray(body.data) ? body.data : body.data ? [body.data] : []
  let optOuts = 0
  let replies = 0
  for (const item of items) {
    const jid = item.key?.remoteJid ?? ''
    if (item.key?.fromMe || !jid.endsWith('@s.whatsapp.net')) continue
    const phone = jid.split('@')[0].replace(/\D/g, '')
    const text = item.message?.conversation ?? item.message?.extendedTextMessage?.text ?? ''
    const words = normalize(text).split(/\s+/).filter(Boolean)
    const wantsOut = words.length > 0 && words.length <= 4 && words.some((w) => keywords.includes(w))
    const hostile = !wantsOut && (HOSTILE.test(normalize(text)) || HOSTILE_EMOJI.test(text))
    const masked = `${phone.slice(0, 4)}…${phone.slice(-4)}`

    if (wantsOut || hostile) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO broadcast_contacts (phone, opted_out, opted_out_at, source) VALUES ($1, true, now(), 'descadastro via WhatsApp')
         ON CONFLICT (phone) DO UPDATE SET opted_out = true, opted_out_at = now(), last_reply_at = now()
         RETURNING id::text`,
        [phone],
      )
      await pool.query(
        `UPDATE broadcast_messages SET status = 'skipped', skip_reason = 'descadastrado' WHERE contact_id = $1 AND status = 'pending'`,
        [rows[0].id],
      )
      await pool
        .query(
          `UPDATE broadcast_messages SET replied_at = COALESCE(replied_at, now()), reply_text = $2,
                  followup_status = CASE WHEN followup_status IN ('pending') OR followup_status IS NULL THEN 'skipped' ELSE followup_status END
            WHERE contact_id = $1 AND status = 'sent' AND sent_at > now() - interval '7 days'`,
          [rows[0].id, text.slice(0, 500)],
        )
        .catch(() => {})
      await logEvent(
        null,
        hostile ? 'resposta_hostil' : 'descadastro',
        hostile ? `Contato ${masked} respondeu de forma negativa: "${text.slice(0, 80)}". Bloqueado para sempre.` : `Contato ${masked} pediu para sair.`,
      )
      optOuts++
      continue
    }

    const { rows } = await pool.query<{ id: string }>(
      `UPDATE broadcast_contacts SET last_reply_at = now() WHERE phone = $1 RETURNING id::text`,
      [phone],
    )
    if (!rows[0]) continue
    // A reply to a two-step opener schedules the offer after a human-like pause (1.5 to 6 minutes).
    await pool.query(
      `UPDATE broadcast_messages m
          SET replied_at = now(), reply_text = $2, reply_key_id = $3,
              followup_status = CASE WHEN cp.two_step AND cardinality(cp.followup_templates) > 0 AND m.followup_status IS NULL
                                     THEN 'pending' ELSE m.followup_status END,
              followup_due_at = CASE WHEN cp.two_step AND m.followup_status IS NULL
                                     THEN now() + make_interval(secs => 90 + floor(random() * 270)::int) ELSE m.followup_due_at END
         FROM broadcast_campaigns cp
        WHERE cp.id = m.campaign_id
          AND m.id = (SELECT id FROM broadcast_messages WHERE contact_id = $1 AND status = 'sent'
                        AND replied_at IS NULL AND sent_at > now() - interval '7 days'
                      ORDER BY sent_at DESC LIMIT 1)`,
      [rows[0].id, text.slice(0, 500), item.key?.id ?? null],
    )
    replies++
  }
  return NextResponse.json({ ok: true, optOuts, replies })
}

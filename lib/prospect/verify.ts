import 'server-only'
import { pool } from '@/lib/db'
import { checkWhatsAppNumbers } from '@/lib/notify/evolution'
import { loadProspectSettings, checksToday } from '@/lib/prospect/queries'
import { findWhatsAppOnSite } from '@/lib/prospect/site-scan'

const SITE_BATCH = 40
const SITE_CONCURRENCY = 6
const CHECK_CHUNK = 20

export type VerifyResult = {
  sitesRead: number
  sitesWithWhatsApp: number
  yes: number
  no: number
  noPhone: number
  errors: number
  capReached: boolean
  error: string | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** WhatsApp may answer without the Brazilian 9th digit, so numbers are matched by DDD + last 8 digits. */
function matchKey(phone: string) {
  return phone.startsWith('55') && phone.length >= 12 ? `${phone.slice(2, 4)}${phone.slice(-8)}` : phone
}

async function scanSites(searchId: string | null) {
  const { rows } = await pool.query<{ id: string; website: string }>(
    `SELECT id::text, website FROM prospects
      WHERE website IS NOT NULL AND site_checked_at IS NULL AND wa_status = 'pending'
        AND ($1::bigint IS NULL OR search_id = $1)
      ORDER BY id LIMIT $2`,
    [searchId, SITE_BATCH],
  )
  let found = 0
  for (let i = 0; i < rows.length; i += SITE_CONCURRENCY) {
    const slice = rows.slice(i, i + SITE_CONCURRENCY)
    const results = await Promise.all(slice.map((r) => findWhatsAppOnSite(r.website)))
    found += results.filter(Boolean).length
    await pool.query(
      `UPDATE prospects p SET site_whatsapp = NULLIF(t.wa, ''), site_checked_at = now()
         FROM unnest($1::bigint[], $2::text[]) AS t(id, wa) WHERE p.id = t.id`,
      [slice.map((r) => r.id), results.map((r) => r ?? '')],
    )
  }
  return { read: rows.length, found }
}

export async function runVerification(opts: { searchId?: string | null; limit?: number } = {}): Promise<VerifyResult> {
  const searchId = opts.searchId ?? null
  const settings = await loadProspectSettings()
  const result: VerifyResult = { sitesRead: 0, sitesWithWhatsApp: 0, yes: 0, no: 0, noPhone: 0, errors: 0, capReached: false, error: null }

  if (settings.site_scan_enabled) {
    const scan = await scanSites(searchId)
    result.sitesRead = scan.read
    result.sitesWithWhatsApp = scan.found
  }

  const { rowCount } = await pool.query(
    `UPDATE prospects SET wa_status = 'no_phone', wa_checked_at = now()
      WHERE wa_status = 'pending' AND COALESCE(site_whatsapp, phone) IS NULL
        AND (website IS NULL OR site_checked_at IS NOT NULL OR NOT $2)
        AND ($1::bigint IS NULL OR search_id = $1)`,
    [searchId, settings.site_scan_enabled],
  )
  result.noPhone = rowCount ?? 0

  if (!settings.wa_check_enabled) return result

  const remaining = settings.daily_check_cap - (await checksToday())
  if (remaining <= 0) {
    result.capReached = true
    return result
  }
  const { rows } = await pool.query<{ id: string; candidate: string }>(
    `SELECT id::text, COALESCE(site_whatsapp, phone) AS candidate FROM prospects
      WHERE wa_status IN ('pending','error') AND COALESCE(site_whatsapp, phone) IS NOT NULL
        AND (website IS NULL OR site_checked_at IS NOT NULL OR NOT $2)
        AND ($1::bigint IS NULL OR search_id = $1)
      ORDER BY id LIMIT $3`,
    [searchId, settings.site_scan_enabled, Math.min(remaining, opts.limit ?? 200)],
  )
  result.capReached = rows.length === remaining

  for (let i = 0; i < rows.length; i += CHECK_CHUNK) {
    const chunk = rows.slice(i, i + CHECK_CHUNK)
    let answers: Awaited<ReturnType<typeof checkWhatsAppNumbers>>
    try {
      answers = await checkWhatsAppNumbers([...new Set(chunk.map((r) => r.candidate))])
    } catch (e) {
      result.error = (e as Error).message.slice(0, 200)
      break
    }
    const byKey = new Map(answers.filter((a) => a.number).map((a) => [matchKey(a.number), a.exists]))
    const statuses = chunk.map((r) => {
      const exists = byKey.get(matchKey(r.candidate))
      return exists === undefined ? 'error' : exists ? 'yes' : 'no'
    })
    for (const s of statuses) {
      if (s === 'yes') result.yes++
      else if (s === 'no') result.no++
      else result.errors++
    }
    await pool.query(
      `UPDATE prospects p SET wa_status = t.status, wa_checked_at = now()
         FROM unnest($1::bigint[], $2::text[]) AS t(id, status) WHERE p.id = t.id`,
      [chunk.map((r) => r.id), statuses],
    )
    if (i + CHECK_CHUNK < rows.length) await sleep(1500 + Math.random() * 2000)
  }
  return result
}

export function summarize(r: VerifyResult) {
  const parts: string[] = []
  if (r.sitesRead) parts.push(`${r.sitesRead} sites lidos (${r.sitesWithWhatsApp} com link de WhatsApp)`)
  parts.push(`${r.yes} com WhatsApp`, `${r.no} sem WhatsApp`)
  if (r.noPhone) parts.push(`${r.noPhone} sem telefone`)
  if (r.errors) parts.push(`${r.errors} sem resposta`)
  let text = `${parts.join(', ')}.`
  if (r.capReached) text += ' Limite diário de verificações atingido; o restante fica para amanhã.'
  if (r.error) text += ` Evolution falhou: ${r.error}`
  return text
}

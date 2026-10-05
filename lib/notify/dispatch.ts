import 'server-only'
import { pool } from '@/lib/db'
import { RULE_META } from '@/lib/engine/rules'
import { evolutionConfig, sendGroupText } from '@/lib/notify/evolution'

const TIMEZONE = 'America/Sao_Paulo'
const QUIET_START_HOUR = 22
const QUIET_END_HOUR = 7
const MAX_LINES = 20
const MAX_OPPORTUNITIES = 8

/** Stock thresholds in ascending urgency: level 1 at 15 un, level 2 at 10 un, level 3 at 5 un. */
const STOCK_LEVELS = [
  { level: 3, max: 5, label: 'AVISO 3 · URGENTE' },
  { level: 2, max: 10, label: 'AVISO 2' },
  { level: 1, max: 15, label: 'AVISO 1' },
] as const

export function stockLevel(qty: number) {
  return STOCK_LEVELS.find((l) => qty <= l.max)?.level ?? 0
}

function localNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday }
}

function appUrl(path: string) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return host ? `https://${host}${path}` : path
}

function trimList(lines: string[]) {
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… e mais ${lines.length - MAX_LINES} no Alure.`] : lines
}

async function alreadySent(key: string) {
  const { rows } = await pool.query(`SELECT 1 FROM notification_log WHERE dedupe_key = $1 AND status = 'sent'`, [key])
  return rows.length > 0
}

/** Sends one message and records the outcome. Returns true when it reached the group. */
export async function deliver(kind: 'stock' | 'opportunity' | 'reminder' | 'test', dedupeKey: string, message: string) {
  let status: 'sent' | 'error' = 'sent'
  let error: string | null = null
  try {
    await sendGroupText(message)
  } catch (err) {
    status = 'error'
    error = (err as Error).message.slice(0, 500)
  }
  await pool.query(
    `INSERT INTO notification_log (dedupe_key, kind, message, status, error) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (dedupe_key) DO UPDATE SET message = EXCLUDED.message, status = EXCLUDED.status,
       error = EXCLUDED.error, created_at = now()`,
    [dedupeKey, kind, message, status, error],
  )
  if (error) console.error('[alure] whatsapp delivery failed:', error)
  return status === 'sent'
}

type StockRow = {
  product_channel_id: string
  product_id: string
  sku: string
  name: string
  marketplace: string
  qty: number
  prev_level: number | null
}

async function dispatchStock(today: string) {
  const logistic = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'product_channels' AND column_name = 'logistic_type') AS ok`,
  )
  // Only Full stock is alerted (db/011). Full units are shared by the SKU, so one row per product.
  const fullOnly = Boolean(logistic.rows[0]?.ok)
  const { rows } = await pool.query<StockRow>(
    `SELECT DISTINCT ON (p.id, pc.marketplace_id)
            pc.id AS product_channel_id, p.id AS product_id, p.sku, p.name, m.name AS marketplace,
            pc.available_quantity AS qty, s.level AS prev_level
       FROM product_channels pc
       JOIN products p ON p.id = pc.product_id
       JOIN marketplaces m ON m.id = pc.marketplace_id
       LEFT JOIN stock_alert_state s ON s.product_channel_id = pc.id
      WHERE pc.status = 'active' AND p.active AND pc.available_quantity IS NOT NULL
            ${fullOnly ? `AND pc.logistic_type = 'fulfillment'` : ''}
      ORDER BY p.id, pc.marketplace_id, pc.available_quantity DESC`,
  )

  const crossed: Array<StockRow & { level: number }> = []
  for (const r of rows) {
    const level = stockLevel(Number(r.qty))
    const prev = r.prev_level === null ? 0 : Number(r.prev_level)
    if (level > prev) crossed.push({ ...r, level })
    else if (level < prev) {
      await pool.query(
        `UPDATE stock_alert_state SET level = $2, stock = $3, updated_at = now() WHERE product_channel_id = $1`,
        [r.product_channel_id, level, r.qty],
      )
    }
  }
  if (!crossed.length) return 0

  const sections = STOCK_LEVELS.map(({ level, label }) => {
    const items = crossed
      .filter((c) => c.level === level)
      .sort((a, b) => Number(a.qty) - Number(b.qty))
      .map((c) => `• ${c.sku} · ${c.name} (${c.marketplace}): *${Number(c.qty) === 0 ? 'ESGOTADO' : `${c.qty} un`}*`)
    return items.length ? [`*${label}* — estoque em até ${STOCK_LEVELS.find((l) => l.level === level)!.max} un`, ...trimList(items)].join('\n') : null
  }).filter(Boolean)

  const message = [fullOnly ? `*ALURE · ESTOQUE FULL*` : `*ALURE · ESTOQUE*`, ...sections, appUrl('/produtos')].join('\n\n')
  const key = `stock:${today}:${crossed.map((c) => `${c.product_channel_id}L${c.level}`).sort().join(',')}`
  if (await alreadySent(key)) return 0
  if (!(await deliver('stock', key, message))) return 0

  for (const c of crossed) {
    await pool.query(
      `INSERT INTO stock_alert_state (product_channel_id, level, stock) VALUES ($1,$2,$3)
       ON CONFLICT (product_channel_id) DO UPDATE SET level = EXCLUDED.level, stock = EXCLUDED.stock, updated_at = now()`,
      [c.product_channel_id, c.level, c.qty],
    )
  }
  return crossed.length
}

const OPPORTUNITY_RULES = Object.entries(RULE_META)
  .filter(([code, meta]) => meta.category === 'commercial' && code !== 'R10_STOCKOUT_RISK')
  .map(([code]) => code)
  .concat('R5_MOMENTUM')

async function dispatchOpportunities() {
  const { rows } = await pool.query<{ id: string; title: string; recommendation: string; sku: string | null; severity: string }>(
    `SELECT r.id, r.title, r.recommendation, p.sku, r.severity
       FROM recommendations r
       LEFT JOIN products p ON p.id = r.product_id
      WHERE r.status = 'open'
        AND r.rule_code = ANY($1::text[])
        AND r.created_at >= now() - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.dedupe_key = 'rec:' || r.id AND n.status = 'sent')
      ORDER BY r.priority_score DESC`,
    [OPPORTUNITY_RULES],
  )
  if (!rows.length) return 0

  const lines = rows.slice(0, MAX_OPPORTUNITIES).map((r) => {
    const tag = r.severity === 'positive' ? 'OPORTUNIDADE' : r.severity === 'critical' ? 'CRÍTICO' : 'MELHORIA'
    return `• [${tag}] ${r.sku ? `${r.sku} · ` : ''}${r.title}\n  → ${r.recommendation}`
  })
  if (rows.length > MAX_OPPORTUNITIES) lines.push(`… e mais ${rows.length - MAX_OPPORTUNITIES} em Oportunidades.`)
  const message = [`*ALURE · OPORTUNIDADES IDENTIFICADAS*`, lines.join('\n'), appUrl('/oportunidades')].join('\n\n')

  const digestKey = `opp:${rows.map((r) => r.id).join(',')}`
  if (!(await deliver('opportunity', digestKey, message))) return 0
  for (const r of rows) {
    await pool.query(
      `INSERT INTO notification_log (dedupe_key, kind, message, status) VALUES ($1, 'opportunity', $2, 'sent')
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [`rec:${r.id}`, `Incluída no aviso ${digestKey}`],
    )
  }
  return rows.length
}

async function dispatchReminders(now: ReturnType<typeof localNow>) {
  const { rows } = await pool.query<{ id: string; title: string; message: string | null }>(
    `SELECT id, title, message FROM notification_reminders
      WHERE active AND $1::smallint = ANY(weekdays) AND hour <= $2
        AND (last_sent_on IS NULL OR last_sent_on < $3::date)
      ORDER BY hour, id`,
    [now.weekday, now.hour, now.date],
  )
  let sent = 0
  for (const r of rows) {
    const text = [`*ALURE · LEMBRETE*`, `*${r.title}*`, r.message].filter(Boolean).join('\n\n')
    if (await deliver('reminder', `reminder:${r.id}:${now.date}`, text)) {
      await pool.query(`UPDATE notification_reminders SET last_sent_on = $2::date WHERE id = $1`, [r.id, now.date])
      sent++
    }
  }
  return sent
}

export type DispatchResult =
  | { status: 'not_configured' | 'quiet_hours' | 'missing_schema' }
  | { status: 'done'; stock: number; opportunities: number; reminders: number }

export async function dispatchNotifications(): Promise<DispatchResult> {
  const cfg = evolutionConfig()
  if (!cfg?.groupJid) return { status: 'not_configured' }

  const now = localNow()
  if (now.hour >= QUIET_START_HOUR || now.hour < QUIET_END_HOUR) return { status: 'quiet_hours' }

  const { rows } = await pool.query<{ ok: boolean }>(`SELECT to_regclass('public.notification_log') IS NOT NULL AS ok`)
  if (!rows[0]?.ok) return { status: 'missing_schema' }

  const stock = await dispatchStock(now.date)
  const opportunities = await dispatchOpportunities()
  const reminders = await dispatchReminders(now)
  return { status: 'done', stock, opportunities, reminders }
}

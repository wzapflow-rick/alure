import 'server-only'
import { pool } from '@/lib/db'
import { resolveInstanceName } from '@/lib/notify/evolution'

export type InstanceRow = {
  id: string
  company_id: string
  company_name: string
  name: string | null
  label: string
  phone: string | null
  created_at: string
  /** Name used on the Evolution API (legacy rows fall back to EVOLUTION_INSTANCE). */
  evo: string
  last_state: string | null
  paused_all: boolean
  quarantine_until: string | null
}

const SELECT = `
  SELECT i.id::text, i.company_id::text, c.name AS company_name, i.name, i.label, i.phone, i.created_at::text,
         s.last_state, COALESCE(s.paused_all, false) AS paused_all, s.quarantine_until::text
    FROM dsp_instances i
    JOIN dsp_companies c ON c.id = i.company_id
    LEFT JOIN broadcast_settings s ON s.id = i.id
   WHERE i.deleted_at IS NULL`

function withEvo(rows: Omit<InstanceRow, 'evo'>[]): InstanceRow[] {
  return rows.map((r) => ({ ...r, evo: resolveInstanceName(r.name) }))
}

export async function listInstances(companyId: string) {
  const { rows } = await pool.query(`${SELECT} AND i.company_id = $1 ORDER BY i.id`, [companyId])
  return withEvo(rows)
}

export async function listAllInstances() {
  const { rows } = await pool.query(`${SELECT} ORDER BY c.name, i.id`)
  return withEvo(rows)
}

/** Only returns the number when it belongs to the company: every action goes through here. */
export async function getInstance(companyId: string, id: string | null | undefined) {
  if (!id || !/^\d+$/.test(id)) return null
  const { rows } = await pool.query(`${SELECT} AND i.company_id = $1 AND i.id = $2`, [companyId, id])
  return withEvo(rows)[0] ?? null
}

export async function getInstanceById(id: string) {
  const { rows } = await pool.query(`${SELECT} AND i.id = $1`, [id])
  return withEvo(rows)[0] ?? null
}

/** Webhooks carry the instance name; the original one (name NULL) answers for EVOLUTION_INSTANCE. */
export async function instanceByEvoName(evoName: string | null | undefined) {
  const name = evoName?.trim()
  const legacy = process.env.EVOLUTION_INSTANCE?.trim()
  const { rows } = await pool.query(
    `${SELECT} AND (i.name = $1 OR (i.name IS NULL AND ($1::text IS NULL OR $1 = $2))) ORDER BY (i.name IS NULL) LIMIT 1`,
    [name || null, legacy ?? ''],
  )
  return withEvo(rows)[0] ?? null
}

/** Number used to ask WhatsApp who has an account (Prospecção). Prefers a connected one. */
export async function checkerInstance(companyId: string) {
  const list = await listInstances(companyId)
  const pick = list.find((i) => i.last_state === 'open') ?? list[0]
  return pick?.evo || null
}

export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

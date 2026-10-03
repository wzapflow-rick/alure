import 'server-only'

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instance: string
  groupJid: string | null
  groupJidInvalid: boolean
}

function normalizeBaseUrl(raw: string) {
  const url = raw.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function normalizeGroupJid(raw: string) {
  const jid = raw.trim()
  return /^[\d-]+$/.test(jid) ? `${jid}@g.us` : jid
}

export function evolutionConfig(): EvolutionConfig | null {
  const rawUrl = process.env.EVOLUTION_API_URL?.trim()
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const instance = process.env.EVOLUTION_INSTANCE?.trim()
  if (!rawUrl || !apiKey || !instance) return null
  const rawJid = process.env.WHATSAPP_GROUP_JID?.trim()
  const jid = rawJid ? normalizeGroupJid(rawJid) : null
  const valid = jid ? /^[\d-]+@g\.us$/.test(jid) : false
  return {
    baseUrl: normalizeBaseUrl(rawUrl),
    apiKey,
    instance,
    groupJid: valid ? jid : null,
    groupJidInvalid: Boolean(jid) && !valid,
  }
}

export type ConnectionState = 'open' | 'connecting' | 'close' | 'unknown'

export async function connectionState(): Promise<ConnectionState> {
  const cfg = evolutionConfig()
  if (!cfg) return 'unknown'
  const res = await evolutionFetch<{ instance?: { state?: string } }>(
    cfg,
    `/instance/connectionState/${encodeURIComponent(cfg.instance)}`,
  ).catch(() => null)
  const state = res?.instance?.state
  return state === 'open' || state === 'connecting' || state === 'close' ? state : 'unknown'
}

async function evolutionFetch<T>(cfg: EvolutionConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Evolution API ${res.status}: ${body.slice(0, 300)}`)
  return (body ? JSON.parse(body) : null) as T
}

async function sendText(cfg: EvolutionConfig, number: string, text: string) {
  await evolutionFetch(cfg, `/message/sendText/${encodeURIComponent(cfg.instance)}`, {
    method: 'POST',
    body: JSON.stringify({ number, text }),
  })
}

export async function sendGroupText(text: string) {
  const cfg = evolutionConfig()
  if (!cfg) throw new Error('Evolution API não configurada (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE).')
  if (!cfg.groupJid) throw new Error('Grupo não configurado (WHATSAPP_GROUP_JID).')
  await sendText(cfg, cfg.groupJid, text)
}

/**
 * Catalog orders go to CATALOG_WHATSAPP_TO (a phone number or a group id) and fall back
 * to the alerts group, so the feature works with the Evolution setup that already exists.
 */
export async function sendCatalogOrderText(text: string) {
  const cfg = evolutionConfig()
  if (!cfg) throw new Error('Evolution API não configurada (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE).')
  const raw = process.env.CATALOG_WHATSAPP_TO?.trim()
  let target: string | null = cfg.groupJid
  if (raw) {
    if (raw.includes('@') || raw.includes('-')) target = normalizeGroupJid(raw)
    else {
      const digits = raw.replace(/\D/g, '')
      target = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
    }
  }
  if (!target) throw new Error('Destino não configurado (CATALOG_WHATSAPP_TO ou WHATSAPP_GROUP_JID).')
  await sendText(cfg, target, text)
}

export type WhatsAppGroup = { id: string; subject: string }

export async function listGroups(): Promise<WhatsAppGroup[]> {
  const cfg = evolutionConfig()
  if (!cfg) return []
  const groups = await evolutionFetch<Array<{ id: string; subject?: string }>>(
    cfg,
    `/group/fetchAllGroups/${encodeURIComponent(cfg.instance)}?getParticipants=false`,
  )
  return (groups ?? []).map((g) => ({ id: g.id, subject: g.subject ?? '(sem nome)' }))
}

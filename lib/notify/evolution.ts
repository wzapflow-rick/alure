import 'server-only'

type EvolutionConfig = { baseUrl: string; apiKey: string; instance: string; groupJid: string | null }

export function evolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const instance = process.env.EVOLUTION_INSTANCE?.trim()
  if (!baseUrl || !apiKey || !instance) return null
  return { baseUrl, apiKey, instance, groupJid: process.env.WHATSAPP_GROUP_JID?.trim() || null }
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

export async function sendGroupText(text: string) {
  const cfg = evolutionConfig()
  if (!cfg) throw new Error('Evolution API não configurada (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE).')
  if (!cfg.groupJid) throw new Error('Grupo não configurado (WHATSAPP_GROUP_JID).')
  await evolutionFetch(cfg, `/message/sendText/${encodeURIComponent(cfg.instance)}`, {
    method: 'POST',
    body: JSON.stringify({ number: cfg.groupJid, text }),
  })
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

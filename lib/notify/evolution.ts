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

/** Server-level access (global key): enough to manage and use any instance. */
export function evolutionServerConfig(): EvolutionConfig | null {
  const rawUrl = process.env.EVOLUTION_API_URL?.trim()
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  if (!rawUrl || !apiKey) return null
  return { baseUrl: normalizeBaseUrl(rawUrl), apiKey, instance: process.env.EVOLUTION_INSTANCE?.trim() ?? '', groupJid: null, groupJidInvalid: false }
}

export type ConnectionState = 'open' | 'connecting' | 'close' | 'unknown'

/** Instance name for a Disparos number; NULL means the original EVOLUTION_INSTANCE. */
export function resolveInstanceName(name: string | null | undefined) {
  return name?.trim() || process.env.EVOLUTION_INSTANCE?.trim() || ''
}

export async function connectionState(instance?: string): Promise<ConnectionState> {
  const cfg = evolutionServerConfig()
  const name = instance ?? cfg?.instance
  if (!cfg || !name) return 'unknown'
  const res = await evolutionFetch<{ instance?: { state?: string } }>(cfg, `/instance/connectionState/${encodeURIComponent(name)}`).catch(
    (e) => (e instanceof EvolutionApiError && e.status === 404 ? { instance: { state: 'close' } } : null),
  )
  const state = res?.instance?.state
  return state === 'open' || state === 'connecting' || state === 'close' ? state : 'unknown'
}

const INSTANCE_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'LOGOUT_INSTANCE']

function requireServer() {
  const cfg = evolutionServerConfig()
  if (!cfg) throw new Error('Evolution API não configurada (EVOLUTION_API_URL e EVOLUTION_API_KEY).')
  return cfg
}

export async function createInstance(name: string, webhookUrl: string | null) {
  const cfg = requireServer()
  const res = await evolutionFetch<{ qrcode?: { base64?: string } }>(cfg, `/instance/create`, {
    method: 'POST',
    body: JSON.stringify({
      instanceName: name,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      ...(webhookUrl ? { webhook: { url: webhookUrl, byEvents: false, base64: false, events: INSTANCE_EVENTS } } : {}),
    }),
  })
  return res?.qrcode?.base64 ?? null
}

export async function setInstanceWebhook(name: string, webhookUrl: string) {
  const cfg = requireServer()
  await evolutionFetch(cfg, `/webhook/set/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: INSTANCE_EVENTS } }),
  })
}

/** QR code (data URL) to pair the phone; null when the instance is already connected. */
export async function connectQr(name: string) {
  const cfg = requireServer()
  const res = await evolutionFetch<{ base64?: string; code?: string; pairingCode?: string | null }>(
    cfg,
    `/instance/connect/${encodeURIComponent(name)}`,
  )
  return res?.base64 ?? null
}

export async function logoutInstance(name: string) {
  const cfg = requireServer()
  await evolutionFetch(cfg, `/instance/logout/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch((e) => {
    if (!(e instanceof EvolutionApiError) || e.status >= 500) throw e
  })
}

export async function deleteInstance(name: string) {
  const cfg = requireServer()
  await evolutionFetch(cfg, `/instance/delete/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch((e) => {
    if (!(e instanceof EvolutionApiError) || e.status >= 500) throw e
  })
}

/** Phone number paired to the instance, digits only. */
export async function instanceOwner(name: string) {
  const cfg = requireServer()
  const res = await evolutionFetch<Array<{ ownerJid?: string; owner?: string; number?: string; instance?: { owner?: string } }>>(
    cfg,
    `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
  ).catch(() => null)
  const row = Array.isArray(res) ? res[0] : null
  const jid = row?.ownerJid ?? row?.owner ?? row?.instance?.owner ?? row?.number ?? ''
  const digits = String(jid).split('@')[0].replace(/\D/g, '')
  return digits || null
}

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function evolutionFetch<T>(cfg: EvolutionConfig, path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  const body = await res.text()
  if (!res.ok) throw new EvolutionApiError(`Evolution API ${res.status}: ${body.slice(0, 300)}`, res.status)
  return (body ? JSON.parse(body) : null) as T
}

function requireConfig() {
  const cfg = evolutionConfig()
  if (!cfg) throw new Error('Evolution API não configurada (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE).')
  return cfg
}

function instanceTarget(instance?: string) {
  const cfg = instance ? requireServer() : requireConfig()
  const name = instance ?? cfg.instance
  if (!name) throw new Error('Instância da Evolution não definida.')
  return { cfg, name }
}

/** Direct message to one contact. `typingMs` makes WhatsApp show "digitando…" before the text arrives. */
export async function sendDirectText(
  number: string,
  text: string,
  opts: { typingMs?: number; linkPreview?: boolean; instance?: string } = {},
) {
  const { cfg, name } = instanceTarget(opts.instance)
  const typingMs = Math.max(0, Math.round(opts.typingMs ?? 0))
  const res = await evolutionFetch<{ key?: { id?: string } }>(
    cfg,
    `/message/sendText/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      body: JSON.stringify({ number, text, ...(typingMs ? { delay: typingMs } : {}), linkPreview: opts.linkPreview ?? true }),
    },
    typingMs + 30_000,
  )
  return res?.key?.id ?? null
}

/** Blue ticks on the contact's reply before answering it, like a person reading the chat. */
export async function markMessageRead(phone: string, messageId: string, instance?: string) {
  const { cfg, name } = instanceTarget(instance)
  await evolutionFetch(
    cfg,
    `/chat/markMessageAsRead/${encodeURIComponent(name)}`,
    { method: 'POST', body: JSON.stringify({ readMessages: [{ remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: messageId }] }) },
    10_000,
  )
}

/** Asks WhatsApp whether the numbers have an account, without messaging them. */
export async function checkWhatsAppNumbers(numbers: string[], instance?: string) {
  const { cfg, name } = instanceTarget(instance)
  const res = await evolutionFetch<Array<{ exists?: boolean; number?: string; jid?: string }>>(
    cfg,
    `/chat/whatsappNumbers/${encodeURIComponent(name)}`,
    { method: 'POST', body: JSON.stringify({ numbers }) },
  )
  return (res ?? []).map((r) => ({ number: String(r.number ?? r.jid ?? '').replace(/\D/g, ''), exists: Boolean(r.exists) }))
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

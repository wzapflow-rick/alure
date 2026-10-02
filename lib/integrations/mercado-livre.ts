import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getActiveConnection, type TokenSet } from '@/lib/integrations/connections'
import type { DateRange, NormalizedDailyMetric, NormalizedListing, NormalizedOrder } from '@/lib/integrations/types'
import { pool } from '@/lib/db'

// Endpoints taken from developers.mercadolivre.com.br (Autenticação e Autorização, Visitas,
// Gerenciar vendas, Itens). Anything not listed there is intentionally not called.
const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
const API = 'https://api.mercadolibre.com'
const PAGE = 50
const MULTIGET = 20

export function meliConfig() {
  const clientId = process.env.MELI_CLIENT_ID
  const clientSecret = process.env.MELI_CLIENT_SECRET
  const redirectUri = process.env.MELI_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri, pkce: process.env.MELI_PKCE === 'true' }
}

export function createOAuthState() {
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { state, verifier, challenge }
}

export function buildAuthorizationUrl(state: string, challenge: string) {
  const cfg = meliConfig()
  if (!cfg) throw new Error('Credenciais do Mercado Livre ausentes.')
  const url = new URL(AUTH_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('redirect_uri', cfg.redirectUri)
  url.searchParams.set('state', state)
  if (cfg.pkce) {
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  return url.toString()
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet & { userId: string }> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(`Mercado Livre OAuth: ${String(json.error ?? res.status)} ${String(json.error_description ?? '')}`.trim())
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresIn: Number(json.expires_in ?? 21600),
    scopes: String(json.scope ?? '').split(' ').filter(Boolean),
    userId: String(json.user_id),
  }
}

export async function exchangeCode(code: string, verifier: string) {
  const cfg = meliConfig()
  if (!cfg) throw new Error('Credenciais do Mercado Livre ausentes.')
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    ...(cfg.pkce ? { code_verifier: verifier } : {}),
  })
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const cfg = meliConfig()
  if (!cfg) throw new Error('Credenciais do Mercado Livre ausentes.')
  return tokenRequest({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  })
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Mercado Livre ${res.status} em ${path.split('?')[0]}: ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }
  throw new Error(`Mercado Livre: limite de requisições atingido em ${path.split('?')[0]}.`)
}

export async function fetchMe(accessToken: string) {
  return apiGet<{ id: number; nickname: string }>('/users/me', accessToken)
}

export type RawCall = { endpoint: string; status: number; durationMs: number; body: unknown }

/** Never throws: diagnostics need the real HTTP status (403/404) instead of an exception. */
export async function apiGetRaw(path: string, accessToken: string): Promise<RawCall> {
  const started = Date.now()
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    const text = await res.text().catch(() => '')
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {}
    return { endpoint: path, status: res.status, durationMs: Date.now() - started, body }
  }
}

export async function connection() {
  const conn = await getActiveConnection('mercado_livre', refreshAccessToken)
  if (!conn) throw new Error('Mercado Livre não conectado ou token expirado. Conecte novamente em Configurações.')
  return conn
}

type MeliItem = {
  id: string
  title: string
  price: number
  permalink: string
  status: string
  available_quantity?: number | null
  seller_custom_field: string | null
  attributes?: { id: string; value_name: string | null }[]
  catalog_listing?: boolean | null
  catalog_product_id?: string | null
}

function itemSku(item: MeliItem) {
  return item.seller_custom_field?.trim() || item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name?.trim() || null
}

export const listingFetchStats = { searchTotal: 0, fromSearch: 0, fromKnownIds: 0 }

/**
 * Offset pagination stops at 1000 items on /items/search, so listings beyond that were never
 * refreshed. Scan mode has no such cap; ids already stored are re-read directly as a safety net.
 */
export async function fetchListings(knownIds: string[] = []): Promise<NormalizedListing[]> {
  const conn = await connection()
  const found = new Set<string>()
  let scrollId: string | null = null
  for (let page = 0; page < 500; page++) {
    const scroll = scrollId ? `&scroll_id=${encodeURIComponent(scrollId)}` : ''
    const res: { results: string[]; scroll_id?: string; paging?: { total: number } } = await apiGet(
      `/users/${conn.externalAccountId}/items/search?search_type=scan&limit=100${scroll}`,
      conn.accessToken,
    )
    if (page === 0) listingFetchStats.searchTotal = res.paging?.total ?? 0
    if (!res.results?.length) break
    for (const id of res.results) found.add(id)
    if (!res.scroll_id) break
    scrollId = res.scroll_id
  }
  listingFetchStats.fromSearch = found.size
  const extra = knownIds.filter((id) => !found.has(id))
  listingFetchStats.fromKnownIds = extra.length
  const ids = [...found, ...extra]

  const listings: NormalizedListing[] = []
  for (let i = 0; i < ids.length; i += MULTIGET) {
    const batch = ids.slice(i, i + MULTIGET).join(',')
    const res = await apiGet<{ code: number; body: MeliItem }[]>(
      `/items?ids=${batch}&attributes=id,title,price,permalink,status,available_quantity,seller_custom_field,attributes,catalog_listing,catalog_product_id`,
      conn.accessToken,
    )
    for (const { code, body } of res) {
      if (code !== 200 || !body) continue
      listings.push({
        externalListingId: body.id,
        sku: itemSku(body),
        title: body.title,
        url: body.permalink,
        price: Number(body.price),
        status: body.status === 'active' ? 'active' : body.status === 'paused' ? 'paused' : 'inactive',
        availableQuantity: typeof body.available_quantity === 'number' ? body.available_quantity : null,
        catalogListing: Boolean(body.catalog_listing),
        catalogProductId: body.catalog_product_id ?? null,
      })
    }
  }
  return listings
}

type MeliOrder = {
  id: number
  status: string
  date_created: string
  total_amount: number
  order_items: {
    item: { id: string; seller_sku: string | null; variation_id: number | null }
    quantity: number
    unit_price: number
  }[]
}

export async function fetchOrders(range: DateRange): Promise<NormalizedOrder[]> {
  const conn = await connection()
  const from = encodeURIComponent(`${range.from}T00:00:00.000-03:00`)
  const to = encodeURIComponent(`${range.to}T23:59:59.999-03:00`)
  const orders: NormalizedOrder[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await apiGet<{ results: MeliOrder[]; paging: { total: number } }>(
      `/orders/search?seller=${conn.externalAccountId}&order.date_created.from=${from}&order.date_created.to=${to}&sort=date_asc&limit=${PAGE}&offset=${offset}`,
      conn.accessToken,
    )
    for (const o of page.results) {
      orders.push({
        externalId: String(o.id),
        status: o.status,
        orderDate: o.date_created,
        totalAmount: Number(o.total_amount),
        items: o.order_items.map((it) => ({
          externalItemId: `${it.item.id}:${it.item.variation_id ?? ''}`,
          externalListingId: it.item.id,
          sku: it.item.seller_sku,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unit_price),
        })),
        raw: o,
      })
    }
    if (offset + PAGE >= page.paging.total || page.results.length === 0) break
  }
  return orders
}

const VISITS_DELAY_MS = 150
const MAX_CONSECUTIVE_RATE_LIMITS = 3

/**
 * Daily visits per listing (one item per call, max 150 days). Only listings that are active
 * or sold in the range are fetched; a rate limit stops the loop and returns what was read,
 * so traffic never blocks orders from being saved.
 */
export async function fetchDailyVisits(range: DateRange): Promise<NormalizedDailyMetric[] & { warning?: string }> {
  const conn = await connection()
  const days = Math.min(150, Math.max(1, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1))
  const { rows } = await pool.query<{ external_id: string }>(
    `SELECT pc.external_id FROM product_channels pc
      WHERE pc.marketplace_id = $1 AND pc.external_id IS NOT NULL
        AND (pc.status = 'active' OR EXISTS (
              SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
               WHERE o.marketplace_id = pc.marketplace_id
                 AND split_part(oi.external_item_id, ':', 1) = pc.external_id
                 AND (o.order_date AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date))
      ORDER BY (pc.status = 'active') DESC, pc.id`,
    [conn.marketplaceId, range.from, range.to],
  )
  const metrics: NormalizedDailyMetric[] = []
  let fetched = 0
  let failed = 0
  let consecutiveRateLimits = 0
  for (const { external_id } of rows) {
    try {
      const res = await apiGet<{ results: { date: string; total: number }[] }>(
        `/items/${encodeURIComponent(external_id)}/visits/time_window?last=${days}&unit=day&ending=${range.to}`,
        conn.accessToken,
      )
      for (const r of res.results ?? []) {
        metrics.push({ externalListingId: external_id, date: r.date.slice(0, 10), visits: Number(r.total) })
      }
      fetched++
      consecutiveRateLimits = 0
    } catch (error) {
      failed++
      if ((error as Error).message.includes('limite de requisições') && ++consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) break
    }
    await new Promise((r) => setTimeout(r, VISITS_DELAY_MS))
  }
  const missing = rows.length - fetched
  return Object.assign(metrics, {
    warning: missing > 0 ? `Visitas parciais: ${fetched} de ${rows.length} anúncios lidos (${failed} falhas, limite de requisições do Mercado Livre).` : undefined,
  })
}

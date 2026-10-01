import 'server-only'
import { createHmac } from 'node:crypto'
import { getActiveConnection, type TokenSet } from '@/lib/integrations/connections'
import type { DateRange, NormalizedListing, NormalizedOrder } from '@/lib/integrations/types'

// Shopee Open Platform v2. Every call is signed with HMAC-SHA256 over
// partner_id + path + timestamp (+ access_token + shop_id for shop-level calls).
const DEFAULT_HOST = 'https://partner.shopeemobile.com'
const ORDER_WINDOW_DAYS = 15
const DETAIL_BATCH = 50
const ITEM_BATCH = 50

export function shopeeConfig() {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY
  const redirectUri = process.env.SHOPEE_REDIRECT_URI
  if (!partnerId || !partnerKey || !redirectUri) return null
  return { partnerId: Number(partnerId), partnerKey, redirectUri, host: process.env.SHOPEE_HOST || DEFAULT_HOST }
}

function requireConfig() {
  const cfg = shopeeConfig()
  if (!cfg) throw new Error('Credenciais da Shopee ausentes.')
  return cfg
}

function sign(partnerKey: string, base: string) {
  return createHmac('sha256', partnerKey).update(base).digest('hex')
}

function now() {
  return Math.floor(Date.now() / 1000)
}

export function buildAuthorizationUrl(state: string) {
  const cfg = requireConfig()
  const path = '/api/v2/shop/auth_partner'
  const ts = now()
  const redirect = new URL(cfg.redirectUri)
  redirect.searchParams.set('state', state)
  const url = new URL(path, cfg.host)
  url.searchParams.set('partner_id', String(cfg.partnerId))
  url.searchParams.set('timestamp', String(ts))
  url.searchParams.set('sign', sign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}`))
  url.searchParams.set('redirect', redirect.toString())
  return url.toString()
}

type ShopeeEnvelope = { error?: string; message?: string; request_id?: string }

async function readJson<T extends ShopeeEnvelope>(res: Response, path: string): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T
  if (!res.ok || json.error) {
    throw new Error(`Shopee ${res.status} em ${path}: ${json.error || ''} ${json.message || ''}`.trim())
  }
  return json
}

async function authPost(path: string, body: Record<string, unknown>) {
  const cfg = requireConfig()
  const ts = now()
  const url = new URL(path, cfg.host)
  url.searchParams.set('partner_id', String(cfg.partnerId))
  url.searchParams.set('timestamp', String(ts))
  url.searchParams.set('sign', sign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}`))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, partner_id: cfg.partnerId }),
    cache: 'no-store',
  })
  const json = await readJson<ShopeeEnvelope & { access_token: string; refresh_token: string; expire_in: number }>(res, path)
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: Number(json.expire_in ?? 14400),
    scopes: [],
  } satisfies TokenSet
}

export function exchangeCode(code: string, shopId: string) {
  return authPost('/api/v2/auth/token/get', { code, shop_id: Number(shopId) })
}

export function refreshAccessToken(refreshToken: string, shopId: string) {
  return authPost('/api/v2/auth/access_token/get', { refresh_token: refreshToken, shop_id: Number(shopId) })
}

type Params = Record<string, string | number | (string | number)[]>

async function shopGet<T>(path: string, accessToken: string, shopId: string, params: Params = {}): Promise<T> {
  const cfg = requireConfig()
  for (let attempt = 0; attempt < 3; attempt++) {
    const ts = now()
    const url = new URL(path, cfg.host)
    url.searchParams.set('partner_id', String(cfg.partnerId))
    url.searchParams.set('timestamp', String(ts))
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('shop_id', shopId)
    url.searchParams.set('sign', sign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}${accessToken}${shopId}`))
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
    }
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    const json = await readJson<ShopeeEnvelope & { response: T }>(res, path)
    return json.response
  }
  throw new Error(`Shopee: limite de requisições atingido em ${path}.`)
}

export async function fetchShopInfo(accessToken: string, shopId: string) {
  const cfg = requireConfig()
  const path = '/api/v2/shop/get_shop_info'
  const ts = now()
  const url = new URL(path, cfg.host)
  url.searchParams.set('partner_id', String(cfg.partnerId))
  url.searchParams.set('timestamp', String(ts))
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('shop_id', shopId)
  url.searchParams.set('sign', sign(cfg.partnerKey, `${cfg.partnerId}${path}${ts}${accessToken}${shopId}`))
  const res = await fetch(url, { cache: 'no-store' })
  // get_shop_info returns fields at the top level instead of under "response".
  return readJson<ShopeeEnvelope & { shop_name?: string }>(res, path)
}

async function connection() {
  const conn = await getActiveConnection('shopee', refreshAccessToken)
  if (!conn) throw new Error('Shopee não conectada ou token expirado. Conecte novamente em Configurações.')
  return conn
}

type ItemBase = {
  item_id: number
  item_name: string
  item_sku?: string
  item_status: string
  has_model?: boolean
  price_info?: { current_price: number }[]
}

function listingStatus(status: string): NormalizedListing['status'] {
  if (status === 'NORMAL') return 'active'
  if (status === 'UNLIST') return 'paused'
  return 'inactive'
}

export async function fetchListings(): Promise<NormalizedListing[]> {
  const conn = await connection()
  const shopId = conn.externalAccountId
  const ids: number[] = []
  for (const status of ['NORMAL', 'UNLIST']) {
    let offset = 0
    for (let page = 0; page < 50; page++) {
      const res = await shopGet<{ item?: { item_id: number }[]; has_next_page: boolean; next_offset: number }>(
        '/api/v2/product/get_item_list',
        conn.accessToken,
        shopId,
        { offset, page_size: 100, item_status: status },
      )
      ids.push(...(res.item ?? []).map((i) => i.item_id))
      if (!res.has_next_page) break
      offset = res.next_offset
    }
  }

  const listings: NormalizedListing[] = []
  for (let i = 0; i < ids.length; i += ITEM_BATCH) {
    const res = await shopGet<{ item_list?: ItemBase[] }>('/api/v2/product/get_item_base_info', conn.accessToken, shopId, {
      item_id_list: ids.slice(i, i + ITEM_BATCH),
    })
    for (const item of res.item_list ?? []) {
      let price = Number(item.price_info?.[0]?.current_price ?? 0)
      if (!price && item.has_model) {
        const models = await shopGet<{ model?: { price_info?: { current_price: number }[] }[] }>(
          '/api/v2/product/get_model_list',
          conn.accessToken,
          shopId,
          { item_id: item.item_id },
        )
        const prices = (models.model ?? []).map((m) => Number(m.price_info?.[0]?.current_price ?? 0)).filter((p) => p > 0)
        price = prices.length ? Math.min(...prices) : 0
      }
      listings.push({
        externalListingId: String(item.item_id),
        sku: item.item_sku?.trim() || null,
        title: item.item_name,
        url: `https://shopee.com.br/product/${shopId}/${item.item_id}`,
        price,
        status: listingStatus(item.item_status),
      })
    }
  }
  return listings
}

type OrderDetail = {
  order_sn: string
  order_status: string
  create_time: number
  total_amount: number
  item_list?: {
    item_id: number
    model_id: number
    item_sku?: string
    model_sku?: string
    model_quantity_purchased: number
    model_discounted_price: number
  }[]
}

// Maps Shopee order states onto the statuses the sales rollup already understands.
function orderStatus(status: string) {
  if (['READY_TO_SHIP', 'PROCESSED', 'RETRY_SHIP', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(status)) return 'paid'
  if (status === 'UNPAID') return 'unpaid'
  if (status === 'TO_RETURN') return 'refunded'
  return 'cancelled'
}

function unixRange(range: DateRange) {
  const from = Math.floor(Date.parse(`${range.from}T00:00:00-03:00`) / 1000)
  const to = Math.floor(Date.parse(`${range.to}T23:59:59-03:00`) / 1000)
  return { from, to }
}

export async function fetchOrders(range: DateRange): Promise<NormalizedOrder[]> {
  const conn = await connection()
  const shopId = conn.externalAccountId
  const { from, to } = unixRange(range)
  const window = ORDER_WINDOW_DAYS * 86_400

  const orderSns: string[] = []
  for (let start = from; start <= to; start += window) {
    const end = Math.min(to, start + window - 1)
    let cursor = ''
    for (let page = 0; page < 100; page++) {
      const res = await shopGet<{ order_list?: { order_sn: string }[]; more: boolean; next_cursor: string }>(
        '/api/v2/order/get_order_list',
        conn.accessToken,
        shopId,
        { time_range_field: 'create_time', time_from: start, time_to: end, page_size: 100, cursor },
      )
      orderSns.push(...(res.order_list ?? []).map((o) => o.order_sn))
      if (!res.more) break
      cursor = res.next_cursor
    }
  }

  const orders: NormalizedOrder[] = []
  for (let i = 0; i < orderSns.length; i += DETAIL_BATCH) {
    const res = await shopGet<{ order_list?: OrderDetail[] }>('/api/v2/order/get_order_detail', conn.accessToken, shopId, {
      order_sn_list: orderSns.slice(i, i + DETAIL_BATCH),
      response_optional_fields: ['item_list', 'total_amount'],
    })
    for (const o of res.order_list ?? []) {
      orders.push({
        externalId: o.order_sn,
        status: orderStatus(o.order_status),
        orderDate: new Date(o.create_time * 1000).toISOString(),
        totalAmount: Number(o.total_amount ?? 0),
        items: (o.item_list ?? []).map((it) => ({
          externalItemId: `${it.item_id}:${it.model_id ?? ''}`,
          externalListingId: String(it.item_id),
          sku: it.model_sku?.trim() || it.item_sku?.trim() || null,
          quantity: Number(it.model_quantity_purchased),
          unitPrice: Number(it.model_discounted_price),
        })),
        raw: o,
      })
    }
  }
  return orders
}

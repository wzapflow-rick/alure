import 'server-only'
import type { DateRange } from '@/lib/integrations/types'

// Product Ads v2 (developers.mercadolivre.com.br/pt_br/product-ads-leitura). Legacy endpoints were shut down in Feb/2026.
const API = 'https://api.mercadolibre.com'
const PAGE = 50

export const ADS_METRICS = ['cost', 'clicks', 'prints', 'units_quantity', 'direct_units_quantity', 'indirect_units_quantity', 'total_amount'] as const

export type AdsDailyRow = {
  date: string
  cost: number
  clicks: number
  prints: number
  units: number
  directUnits: number
  indirectUnits: number
  revenue: number
}

async function adsGet<T>(path: string, accessToken: string, apiVersion: '1' | '2'): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json', 'Api-Version': apiVersion },
      cache: 'no-store',
    })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 404 && text.includes('No permissions')) {
        throw new Error('A conta não tem Publicidade (Product Ads) habilitada no Mercado Livre.')
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          'O Mercado Livre negou acesso à Publicidade. Ative a permissão de Publicidade no app do ML e reconecte a conta em Configurações.',
        )
      }
      throw new Error(`Mercado Livre ${res.status} em ${path.split('?')[0]}: ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }
  throw new Error('Mercado Livre: limite de requisições atingido na Publicidade.')
}

export async function fetchAdvertiser(accessToken: string) {
  const data = await adsGet<{ advertisers?: { advertiser_id: number; site_id: string; advertiser_name?: string }[] }>(
    '/advertising/advertisers?product_id=PADS',
    accessToken,
    '1',
  )
  const adv = data.advertisers?.find((a) => a.site_id === 'MLB') ?? data.advertisers?.[0]
  if (!adv) throw new Error('Nenhum anunciante de Product Ads encontrado nesta conta.')
  return { advertiserId: String(adv.advertiser_id), siteId: adv.site_id, name: adv.advertiser_name ?? null }
}

export const FULL_METRICS = [
  'clicks', 'prints', 'ctr', 'cost', 'cpc', 'acos', 'roas', 'cvr', 'sov',
  'organic_units_quantity', 'organic_units_amount', 'organic_items_quantity',
  'direct_items_quantity', 'indirect_items_quantity', 'advertising_items_quantity',
  'direct_units_quantity', 'indirect_units_quantity', 'units_quantity',
  'direct_amount', 'indirect_amount', 'total_amount',
] as const

const CAMPAIGN_DETAIL_METRICS = [
  ...FULL_METRICS,
  'impression_share', 'top_impression_share', 'lost_impression_share_by_budget', 'lost_impression_share_by_ad_rank', 'acos_benchmark',
] as const

type Metrics = Record<string, number | null>

export type AdsCampaign = {
  id: number
  name: string
  status: string
  strategy?: string
  budget?: number
  automatic_budget?: boolean
  roas_target?: number
  acos_target?: number
  date_created?: string
  last_updated?: string
  metrics?: Metrics
}

export type AdsItem = {
  item_id: string
  campaign_id: number
  title: string
  status: string
  price?: number
  current_level?: string
  recommended?: boolean
  buy_box_winner?: boolean
  catalog_listing?: boolean
  listing_type_id?: string
  logistic_type?: string
  permalink?: string
  metrics?: Metrics
  metrics_summary?: Metrics
}

/** Campaigns with budget, strategy, ROAS target and aggregated metrics for the window, plus account summary. */
export async function fetchCampaigns(
  accessToken: string,
  advertiser: { advertiserId: string; siteId: string },
  range: DateRange,
  status?: 'active' | 'paused',
) {
  const campaigns: AdsCampaign[] = []
  let summary: Metrics | null = null
  for (let offset = 0; offset < 1000; offset += PAGE) {
    const qs = new URLSearchParams({
      limit: String(PAGE),
      offset: String(offset),
      date_from: range.from,
      date_to: range.to,
      metrics: FULL_METRICS.join(','),
      metrics_summary: 'true',
    })
    if (status) qs.set('filters[status]', status)
    const page = await adsGet<{ paging?: { total?: number }; results?: AdsCampaign[]; metrics_summary?: Metrics }>(
      `/advertising/${advertiser.siteId}/advertisers/${advertiser.advertiserId}/product_ads/campaigns/search?${qs}`,
      accessToken,
      '2',
    )
    const results = page.results ?? []
    campaigns.push(...results)
    summary ??= page.metrics_summary ?? null
    if (results.length < PAGE || offset + PAGE >= (page.paging?.total ?? 0)) break
  }
  return { campaigns, summary }
}

/** One campaign with impression share, lost share by budget/rank and ACOS benchmark. */
export async function fetchCampaignDetail(accessToken: string, siteId: string, campaignId: string, range: DateRange) {
  const qs = new URLSearchParams({ date_from: range.from, date_to: range.to, metrics: CAMPAIGN_DETAIL_METRICS.join(',') })
  return adsGet<AdsCampaign & { currency_id?: string }>(
    `/advertising/${siteId}/product_ads/campaigns/${encodeURIComponent(campaignId)}?${qs}`,
    accessToken,
    '2',
  )
}

/** Daily metrics for one campaign. */
export async function fetchCampaignDaily(
  accessToken: string,
  advertiser: { advertiserId: string; siteId: string },
  campaignId: string,
  range: DateRange,
) {
  const qs = new URLSearchParams({
    limit: String(PAGE),
    offset: '0',
    date_from: range.from,
    date_to: range.to,
    metrics: FULL_METRICS.join(','),
    aggregation_type: 'DAILY',
    'filters[campaign_ids]': campaignId,
  })
  const page = await adsGet<{ results?: ({ date: string } & Metrics)[] }>(
    `/advertising/${advertiser.siteId}/advertisers/${advertiser.advertiserId}/product_ads/campaigns/search?${qs}`,
    accessToken,
    '2',
  )
  return page.results ?? []
}

/** Ads (listings) with metrics for the window, optionally filtered by campaign or status. */
export async function fetchAdsItems(
  accessToken: string,
  advertiser: { advertiserId: string; siteId: string },
  range: DateRange,
  opts: { campaignId?: string; status?: string; max?: number } = {},
) {
  const max = Math.min(opts.max ?? 300, 1000)
  const items: AdsItem[] = []
  let summary: Metrics | null = null
  let total = 0
  for (let offset = 0; offset < max; offset += PAGE) {
    const qs = new URLSearchParams({
      limit: String(PAGE),
      offset: String(offset),
      date_from: range.from,
      date_to: range.to,
      metrics: FULL_METRICS.join(','),
      metrics_summary: 'true',
    })
    if (opts.campaignId) qs.set('filters[campaign_id]', opts.campaignId)
    if (opts.status) qs.set('filters[statuses]', opts.status)
    const page = await adsGet<{ paging?: { total?: number }; results?: AdsItem[]; metrics_summary?: Metrics }>(
      `/advertising/${advertiser.siteId}/advertisers/${advertiser.advertiserId}/product_ads/ads/search?${qs}`,
      accessToken,
      '2',
    )
    const results = page.results ?? []
    items.push(...results)
    summary ??= page.metrics_summary ?? null
    total = page.paging?.total ?? total
    if (results.length < PAGE || offset + PAGE >= total) break
  }
  return { items, summary, total }
}

/** Single ad detail with its metrics summary. */
export async function fetchAdDetail(accessToken: string, siteId: string, itemId: string, range?: DateRange) {
  const qs = range
    ? `?${new URLSearchParams({ date_from: range.from, date_to: range.to, metrics: FULL_METRICS.join(',') })}`
    : ''
  return adsGet<AdsItem>(`/advertising/${siteId}/product_ads/ads/${encodeURIComponent(itemId)}${qs}`, accessToken, '2')
}

type DailyResult = { date: string } & Partial<Record<(typeof ADS_METRICS)[number], number | null>>

/** Account-level daily totals; rows with the same date are summed in case the API splits them. */
export async function fetchDailyAdsMetrics(
  accessToken: string,
  advertiser: { advertiserId: string; siteId: string },
  range: DateRange,
): Promise<AdsDailyRow[]> {
  const byDate = new Map<string, AdsDailyRow>()
  for (let offset = 0; offset < 5000; offset += PAGE) {
    const qs = new URLSearchParams({
      limit: String(PAGE),
      offset: String(offset),
      date_from: range.from,
      date_to: range.to,
      metrics: ADS_METRICS.join(','),
      aggregation_type: 'DAILY',
    })
    const page = await adsGet<{ paging?: { total?: number }; results?: DailyResult[] }>(
      `/advertising/${advertiser.siteId}/advertisers/${advertiser.advertiserId}/product_ads/campaigns/search?${qs}`,
      accessToken,
      '2',
    )
    const results = page.results ?? []
    for (const r of results) {
      if (!r.date) continue
      const day = r.date.slice(0, 10)
      const row = byDate.get(day) ?? { date: day, cost: 0, clicks: 0, prints: 0, units: 0, directUnits: 0, indirectUnits: 0, revenue: 0 }
      row.cost += Number(r.cost ?? 0)
      row.clicks += Number(r.clicks ?? 0)
      row.prints += Number(r.prints ?? 0)
      row.units += Number(r.units_quantity ?? 0)
      row.directUnits += Number(r.direct_units_quantity ?? 0)
      row.indirectUnits += Number(r.indirect_units_quantity ?? 0)
      row.revenue += Number(r.total_amount ?? 0)
      byDate.set(day, row)
    }
    const total = page.paging?.total ?? 0
    if (results.length < PAGE || offset + PAGE >= total) break
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

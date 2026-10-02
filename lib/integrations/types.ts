export type CapabilityStatus = 'VERIFIED' | 'NEEDS VERIFICATION' | 'NOT AVAILABLE' | 'NOT IMPLEMENTED'

export type Capability =
  | 'oauth'
  | 'orders'
  | 'products'
  | 'listings'
  | 'traffic'
  | 'advertising'
  | 'promotions'
  | 'inventory'
  | 'fees'

export const CAPABILITY_LABELS: Record<Capability, string> = {
  oauth: 'Autenticação OAuth',
  orders: 'Pedidos',
  products: 'Produtos',
  listings: 'Anúncios',
  traffic: 'Visitas / tráfego',
  advertising: 'Publicidade',
  promotions: 'Promoções',
  inventory: 'Estoque',
  fees: 'Taxas',
}

export type CapabilityInfo = { status: CapabilityStatus; note: string }

export type DateRange = { from: string; to: string }

export type NormalizedOrder = {
  externalId: string
  status: string
  orderDate: string
  totalAmount: number
  items: { externalItemId: string; externalListingId: string | null; sku: string | null; quantity: number; unitPrice: number }[]
  raw: unknown
}

export type NormalizedListing = {
  externalListingId: string
  sku: string | null
  title: string
  url: string | null
  price: number
  status: 'active' | 'paused' | 'inactive'
  /** Units available for sale; null when the marketplace does not report it. */
  availableQuantity?: number | null
  /** Mercado Livre catalog listing (competes for the buy box); undefined when unknown. */
  catalogListing?: boolean
  catalogProductId?: string | null
}

export type NormalizedDailyMetric = {
  externalListingId: string
  date: string
  orders?: number
  units?: number
  revenue?: number
  visits?: number
}

export type NormalizedAdMetric = {
  externalCampaignId: string
  campaignName: string
  externalListingId: string | null
  date: string
  impressions: number | null
  clicks: number | null
  cost: number | null
  attributedSales: number | null
  indirectSales: number | null
  attributedRevenue: number | null
  impressionShare: number | null
  lostByBudget: number | null
  lostByRank: number | null
  raw: unknown
}

export interface MarketplaceAdapter {
  code: 'mercado_livre' | 'shopee' | 'upseller'
  name: string
  role: 'marketplace' | 'operational_hub'
  requiredEnv: string[]
  capabilities: Record<Capability, CapabilityInfo>
  fetchListings?(): Promise<NormalizedListing[]>
  fetchOrders(range: DateRange): Promise<NormalizedOrder[]>
  fetchDailyMetrics(range: DateRange): Promise<NormalizedDailyMetric[]>
  fetchAdvertising(range: DateRange): Promise<NormalizedAdMetric[]>
}

export class NotImplementedError extends Error {
  constructor(adapter: string, capability: Capability) {
    super(`${adapter}: capacidade "${CAPABILITY_LABELS[capability]}" ainda não implementada/verificada.`)
    this.name = 'NotImplementedError'
  }
}

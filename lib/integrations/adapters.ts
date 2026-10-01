import { NotImplementedError, type MarketplaceAdapter } from '@/lib/integrations/types'

// Capability statuses must only move to VERIFIED after testing against the
// official API with real credentials. Nothing here is assumed to exist.

export const mercadoLivreAdapter: MarketplaceAdapter = {
  code: 'mercado_livre',
  name: 'Mercado Livre',
  role: 'marketplace',
  requiredEnv: ['MELI_CLIENT_ID', 'MELI_CLIENT_SECRET', 'MELI_REDIRECT_URI'],
  capabilities: {
    oauth: { status: 'NEEDS VERIFICATION', note: 'OAuth 2.0 documentado em developers.mercadolivre.com.br. Fluxo ainda não testado.' },
    orders: { status: 'NEEDS VERIFICATION', note: 'Recurso de pedidos documentado; mapeamento pendente.' },
    products: { status: 'NEEDS VERIFICATION', note: 'Itens do vendedor; mapeamento pendente.' },
    listings: { status: 'NEEDS VERIFICATION', note: 'Status e preço de anúncios; pendente.' },
    traffic: { status: 'NEEDS VERIFICATION', note: 'Visitas por item; granularidade e limites a confirmar.' },
    advertising: { status: 'NEEDS VERIFICATION', note: 'Product Ads: métricas disponíveis por API a confirmar.' },
    promotions: { status: 'NEEDS VERIFICATION', note: 'Campanhas/promoções do vendedor a confirmar.' },
    inventory: { status: 'NEEDS VERIFICATION', note: 'Estoque disponível por item a confirmar.' },
    fees: { status: 'NEEDS VERIFICATION', note: 'Custos de venda por item a confirmar. Até lá, usar regras de taxa manuais.' },
  },
  async fetchOrders() {
    throw new NotImplementedError('Mercado Livre', 'orders')
  },
  async fetchDailyMetrics() {
    throw new NotImplementedError('Mercado Livre', 'traffic')
  },
  async fetchAdvertising() {
    throw new NotImplementedError('Mercado Livre', 'advertising')
  },
}

export const shopeeAdapter: MarketplaceAdapter = {
  code: 'shopee',
  name: 'Shopee',
  role: 'marketplace',
  requiredEnv: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_REDIRECT_URI'],
  capabilities: {
    oauth: { status: 'NEEDS VERIFICATION', note: 'Open Platform exige app aprovado e assinatura HMAC. Não testado.' },
    orders: { status: 'NEEDS VERIFICATION', note: 'API de pedidos a mapear após aprovação do app.' },
    products: { status: 'NEEDS VERIFICATION', note: 'API de produtos a mapear.' },
    listings: { status: 'NEEDS VERIFICATION', note: 'Status/preço de itens a mapear.' },
    traffic: { status: 'NEEDS VERIFICATION', note: 'Disponibilidade de visitas por item via API não confirmada.' },
    advertising: { status: 'NEEDS VERIFICATION', note: 'Métricas de Ads via API não confirmadas.' },
    promotions: { status: 'NEEDS VERIFICATION', note: 'Descontos/promoções a confirmar.' },
    inventory: { status: 'NEEDS VERIFICATION', note: 'Estoque a confirmar.' },
    fees: { status: 'NEEDS VERIFICATION', note: 'Usar regras de taxa manuais até verificação.' },
  },
  async fetchOrders() {
    throw new NotImplementedError('Shopee', 'orders')
  },
  async fetchDailyMetrics() {
    throw new NotImplementedError('Shopee', 'traffic')
  },
  async fetchAdvertising() {
    throw new NotImplementedError('Shopee', 'advertising')
  },
}

export const upsellerAdapter: MarketplaceAdapter = {
  code: 'upseller',
  name: 'UpSeller',
  role: 'operational_hub',
  requiredEnv: [],
  capabilities: {
    oauth: { status: 'NEEDS VERIFICATION', note: 'Existência de API pública ainda não confirmada.' },
    orders: { status: 'NEEDS VERIFICATION', note: 'Pode servir de fonte secundária/reconciliação de pedidos.' },
    products: { status: 'NEEDS VERIFICATION', note: 'A confirmar.' },
    listings: { status: 'NOT IMPLEMENTED', note: 'Hub operacional — não é fonte primária de anúncios.' },
    traffic: { status: 'NOT IMPLEMENTED', note: 'Hub operacional — tráfego vem dos marketplaces.' },
    advertising: { status: 'NOT IMPLEMENTED', note: 'Hub operacional — Ads vêm dos marketplaces.' },
    promotions: { status: 'NOT IMPLEMENTED', note: 'Hub operacional.' },
    inventory: { status: 'NEEDS VERIFICATION', note: 'Possível fonte de estoque consolidado.' },
    fees: { status: 'NOT IMPLEMENTED', note: 'Hub operacional.' },
  },
  async fetchOrders() {
    throw new NotImplementedError('UpSeller', 'orders')
  },
  async fetchDailyMetrics() {
    throw new NotImplementedError('UpSeller', 'traffic')
  },
  async fetchAdvertising() {
    throw new NotImplementedError('UpSeller', 'advertising')
  },
}

export const ADAPTERS: MarketplaceAdapter[] = [mercadoLivreAdapter, shopeeAdapter, upsellerAdapter]

export function getAdapter(code: string) {
  return ADAPTERS.find((a) => a.code === code) ?? null
}

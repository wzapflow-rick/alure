import 'server-only'
import * as meli from '@/lib/integrations/mercado-livre'
import { NotImplementedError, type MarketplaceAdapter } from '@/lib/integrations/types'

// Capability statuses must only move to VERIFIED after testing against the
// official API with real credentials. Nothing here is assumed to exist.

export const mercadoLivreAdapter: MarketplaceAdapter = {
  code: 'mercado_livre',
  name: 'Mercado Livre',
  role: 'marketplace',
  requiredEnv: ['MELI_CLIENT_ID', 'MELI_CLIENT_SECRET', 'MELI_REDIRECT_URI'],
  capabilities: {
    oauth: { status: 'NEEDS VERIFICATION', note: 'Implementado (authorization code + refresh token, state anti-CSRF). Falta testar com a conta real.' },
    orders: { status: 'NEEDS VERIFICATION', note: 'Implementado via /orders/search. Vendas diárias são recalculadas a partir dos pedidos pagos.' },
    products: { status: 'NOT IMPLEMENTED', note: 'Produtos são cadastrados no ALURE; anúncios são vinculados por SKU.' },
    listings: { status: 'NEEDS VERIFICATION', note: 'Implementado: anúncios do vendedor vinculados ao produto pelo SKU, com histórico de preço.' },
    traffic: { status: 'NEEDS VERIFICATION', note: 'Implementado via /items/{id}/visits/time_window (diário, máx. 150 dias).' },
    advertising: { status: 'NEEDS VERIFICATION', note: 'Product Ads: API de métricas mudou recentemente. Não implementado até confirmar.' },
    promotions: { status: 'NEEDS VERIFICATION', note: 'Campanhas/promoções do vendedor a confirmar.' },
    inventory: { status: 'NEEDS VERIFICATION', note: 'Estoque disponível por item a confirmar.' },
    fees: { status: 'NEEDS VERIFICATION', note: 'Custos de venda por item a confirmar. Até lá, usar regras de taxa manuais.' },
  },
  fetchListings: () => meli.fetchListings(),
  fetchOrders: (range) => meli.fetchOrders(range),
  fetchDailyMetrics: (range) => meli.fetchDailyVisits(range),
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

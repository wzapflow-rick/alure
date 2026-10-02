import 'server-only'
import { pool } from '@/lib/db'
import { apiGetRaw, connection, type RawCall } from '@/lib/integrations/mercado-livre'

const NA = 'não disponível pela API'

type Attr = { id: string; value_name: string | null }
type Item = {
  id: string
  title: string
  price: number
  status: string
  category_id: string
  listing_type_id: string
  catalog_product_id: string | null
  catalog_listing: boolean | null
  available_quantity: number | null
  sold_quantity: number | null
  shipping?: { logistic_type?: string; free_shipping?: boolean }
  attributes?: Attr[]
}

const ITEM_FIELDS =
  'id,title,price,status,category_id,listing_type_id,catalog_product_id,catalog_listing,available_quantity,sold_quantity,shipping,attributes'

function attr(item: Item, id: string) {
  return item.attributes?.find((a) => a.id === id)?.value_name ?? NA
}

function ok(call: RawCall) {
  return call.status >= 200 && call.status < 300 && typeof call.body === 'object' && call.body !== null
}

function normalizePriceToWin(call: RawCall) {
  if (!ok(call)) return { disponivel: false, motivo: `HTTP ${call.status}` }
  const b = call.body as Record<string, any>
  return {
    disponivel: true,
    status_competicao: b.status ?? NA,
    preco_atual: b.current_price ?? NA,
    preco_para_ganhar: b.price_to_win ?? NA,
    participacao_visitas: b.visit_share ?? NA,
    concorrentes_dividindo_primeiro_lugar: b.competitors_sharing_first_place ?? NA,
    motivos: b.reason ?? [],
    boosts: (b.boosts ?? []).map((x: any) => ({ id: x.id, status: x.status })),
    vencedor: b.winner
      ? {
          item_id: b.winner.item_id ?? NA,
          preco: b.winner.price ?? NA,
          boosts: (b.winner.boosts ?? []).map((x: any) => ({ id: x.id, status: x.status })),
        }
      : NA,
  }
}

function normalizeSuggestion(call: RawCall) {
  if (!ok(call)) return { disponivel: false, motivo: call.status === 404 ? 'Sem referência de preço para este anúncio (404)' : `HTTP ${call.status}` }
  const b = call.body as Record<string, any>
  return {
    disponivel: true,
    status: b.status ?? NA,
    preco_sugerido: b.suggested_price?.amount ?? NA,
    menor_preco: b.lowest_price?.amount ?? NA,
    preco_interno: b.internal_price?.amount ?? NA,
    diferenca_percentual: b.percent_difference ?? NA,
    tarifa_venda: b.costs?.selling_fees ?? NA,
    custo_frete: b.costs?.shipping_fees ?? NA,
    similares: (b.metadata?.graph ?? []).map((g: any) => ({
      titulo: g.info?.title ?? NA,
      preco: g.price?.amount ?? NA,
      vendidos: g.info?.sold_quantity ?? NA,
      confianca: 'PROVÁVEL (não alimenta recomendação)',
    })),
  }
}

/** Read-only: calls official endpoints and returns raw + normalized payloads. Writes nothing. */
export async function diagnoseSkus(skus: string[]) {
  const conn = await connection()
  const me = await apiGetRaw('/users/me', conn.accessToken)
  const { rows } = await pool.query<{ sku: string; external_id: string | null; current_price: string | null; status: string }>(
    `SELECT p.sku, pc.external_id, pc.current_price, pc.status
       FROM products p
       LEFT JOIN product_channels pc ON pc.product_id = p.id AND pc.marketplace_id = $1
      WHERE p.sku = ANY($2::text[])
      ORDER BY p.sku`,
    [conn.marketplaceId, skus],
  )

  const produtos = []
  for (const sku of skus) {
    const channels = rows.filter((r) => r.sku === sku)
    if (channels.length === 0) {
      produtos.push({ sku, erro: 'SKU não encontrado em products.' })
      continue
    }
    for (const ch of channels) {
      if (!ch.external_id) {
        produtos.push({ sku, erro: 'Sem external_id (MLB) em product_channels para o Mercado Livre.' })
        continue
      }
      const id = encodeURIComponent(ch.external_id)
      const itemCall = await apiGetRaw(`/items/${id}?attributes=${ITEM_FIELDS}`, conn.accessToken)
      const item = ok(itemCall) ? (itemCall.body as Item) : null
      const isCatalog = Boolean(item?.catalog_listing)

      const ptwCall = isCatalog
        ? await apiGetRaw(`/items/${id}/price_to_win?siteId=MLB&version=v2`, conn.accessToken)
        : null
      const sugCall = await apiGetRaw(`/suggestions/items/${id}/details`, conn.accessToken)

      produtos.push({
        sku,
        external_id: ch.external_id,
        banco: { preco_atual: ch.current_price, status: ch.status },
        normalizado: {
          anuncio: item
            ? {
                titulo: item.title,
                preco: item.price,
                status: item.status,
                tipo_anuncio: item.listing_type_id,
                categoria: item.category_id,
                catalogo: isCatalog,
                catalog_product_id: item.catalog_product_id ?? NA,
                full: item.shipping?.logistic_type === 'fulfillment',
                frete_gratis: item.shipping?.free_shipping ?? NA,
                estoque: item.available_quantity ?? NA,
                vendidos: item.sold_quantity ?? NA,
                gtin: attr(item, 'GTIN'),
                marca: attr(item, 'BRAND'),
                modelo: attr(item, 'MODEL'),
                seller_sku: attr(item, 'SELLER_SKU'),
              }
            : { disponivel: false, motivo: `HTTP ${itemCall.status}` },
          competicao_catalogo: ptwCall
            ? normalizePriceToWin(ptwCall)
            : { disponivel: false, motivo: 'Anúncio tradicional: price_to_win só existe para catálogo' },
          referencia_preco: normalizeSuggestion(sugCall),
        },
        bruto: [itemCall, ptwCall, sugCall].filter(Boolean),
      })
    }
  }

  return {
    gerado_em: new Date().toISOString(),
    gravou_no_banco: false,
    conta: ok(me)
      ? { seller_id: (me.body as any).id, nickname: (me.body as any).nickname, confere_com_conexao: String((me.body as any).id) === conn.externalAccountId }
      : { erro: `HTTP ${me.status}` },
    produtos,
  }
}

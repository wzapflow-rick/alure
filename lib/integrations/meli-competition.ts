import 'server-only'
import { pool } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { apiGetRaw, connection, type RawCall } from '@/lib/integrations/mercado-livre'
import { getActiveFeeRules, priceChannel } from '@/lib/pricing/service'
import { getEngineSettings } from '@/lib/settings'
import { competitivePressure, PRESSURE_LABEL, type Competition } from '@/lib/engine/rules'

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

type PreviewChannel = {
  sku: string
  product_channel_id: string
  external_id: string | null
  status: string
  current_price: string
  ads_cost_pct: string
  seller_discount: string
  category: string | null
  average_cost: string | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Read-only dry run: what the engine would conclude per SKU from the official endpoints.
 * Persists nothing, creates no recommendation, test or price change.
 */
export async function previewEngine(skus: string[]) {
  const conn = await connection()
  const [settings, feeRules] = await Promise.all([getEngineSettings(), getActiveFeeRules(todayISO())])
  const { rows } = await pool.query<PreviewChannel>(
    `SELECT p.sku, pc.id AS product_channel_id, pc.external_id, pc.status, pc.current_price,
            pc.ads_cost_pct, pc.seller_discount, p.category, pcs.average_cost
       FROM products p
       JOIN product_channels pc ON pc.product_id = p.id AND pc.marketplace_id = $1
  LEFT JOIN product_costs pcs ON pcs.product_id = p.id AND pcs.active
      WHERE p.sku = ANY($2::text[])
      ORDER BY p.sku, pc.id`,
    [conn.marketplaceId, skus],
  )

  const produtos = []
  for (const sku of skus) {
    const channels = rows.filter((r) => r.sku === sku && r.external_id)
    if (channels.length === 0) {
      produtos.push({ sku, erro: 'SKU sem anúncio do Mercado Livre em product_channels.' })
      continue
    }

    const anuncios = []
    for (const ch of channels) {
      const call = await apiGetRaw(`/items/${encodeURIComponent(ch.external_id!)}?attributes=${ITEM_FIELDS}`, conn.accessToken)
      const item = ok(call) ? (call.body as Item) : null
      anuncios.push({ ch, item, catalogo: Boolean(item?.catalog_listing), ativoNaApi: item?.status === 'active' })
    }

    const ativos = anuncios.filter((a) => a.ativoNaApi)
    // Same priority as primaryListings() in the engine: active catalog listing first.
    const lider = ativos.find((a) => a.catalogo) ?? ativos[0] ?? null
    const divergencias = anuncios
      .filter((a) => a.item && a.item.status !== a.ch.status)
      .map((a) => `${a.ch.external_id}: banco "${a.ch.status}" × API "${a.item!.status}"`)

    const base = {
      sku,
      anuncios: anuncios.map((a) => ({
        mlb: a.ch.external_id,
        tipo: a.catalogo ? 'catálogo' : 'tradicional',
        status_api: a.item?.status ?? `indisponível`,
        status_banco: a.ch.status,
        preco_api: a.item?.price ?? null,
        papel: a === lider ? 'LÍDER (avaliado pelo motor)' : 'secundário (vendas e visitas somadas ao líder)',
      })),
      divergencias_status: divergencias,
      duplicado_nas_recomendacoes: false,
    }
    if (!lider?.item) {
      produtos.push({ ...base, classificacao: 'Sem anúncio ativo na API — não avaliado.' })
      continue
    }

    const id = encodeURIComponent(lider.ch.external_id!)
    const nossoPreco = Number(lider.item.price)
    const pricing = priceChannel(
      {
        marketplaceId: conn.marketplaceId,
        price: nossoPreco,
        adsCostPct: Number(lider.ch.ads_cost_pct),
        sellerDiscount: Number(lider.ch.seller_discount),
        category: lider.ch.category,
        cost: lider.ch.average_cost === null ? null : Number(lider.ch.average_cost),
      },
      feeRules,
      settings.targetMarginPct,
      settings.minMarginPct,
    )
    const piso = pricing.status === 'ok' ? (pricing.minMarginPrice ?? pricing.breakEvenPrice) : null

    const ptw = lider.catalogo ? await apiGetRaw(`/items/${id}/price_to_win?siteId=MLB&version=v2`, conn.accessToken) : null
    const ptwBody = ptw && ok(ptw) ? (ptw.body as Record<string, any>) : null
    const sug = await apiGetRaw(`/suggestions/items/${id}/details`, conn.accessToken)
    const sugBody = ok(sug) ? (sug.body as Record<string, any>) : null

    const winnerId: string | null = ptwBody?.winner?.item_id ?? null
    const winnerPrice = num(ptwBody?.winner?.price)
    const winnerIsUs = winnerId === lider.ch.external_id
    const priceToWin = num(ptwBody?.price_to_win)

    const competition: Competition | null =
      winnerId && winnerPrice && !winnerIsUs
        ? (() => {
            const offer = {
              name: winnerId,
              price: winnerPrice,
              freeShipping: null,
              isFull: null,
              soldQuantity: null,
              source: 'ml_price_to_win',
              observedOn: todayISO(),
              previousPrice: null,
            }
            return { offers: 1, cheapest: offer, all: [offer] }
          })()
        : null

    const pressure = competition ? competitivePressure({ competition, price: nossoPreco, pricing }, settings) : null
    const referencia = num(sugBody?.suggested_price?.amount) ?? num(sugBody?.lowest_price?.amount)

    const nivel = pressure
      ? PRESSURE_LABEL[pressure.level]
      : referencia !== null && referencia >= nossoPreco
        ? 'Sem pressão de preço (referência oficial acima do nosso preço)'
        : referencia !== null
          ? 'Referência oficial abaixo do nosso preço — sinal PROVÁVEL, não gera recomendação'
          : 'Sem dado competitivo oficial'

    produtos.push({
      ...base,
      lider: { mlb: lider.ch.external_id, tipo: lider.catalogo ? 'catálogo' : 'tradicional', nosso_preco: nossoPreco },
      competicao_exata: ptwBody
        ? {
            confianca: 'EXATA',
            fonte: 'price_to_win',
            status_competicao: ptwBody.status ?? null,
            vencedor: winnerId ? { mlb: winnerId, preco: winnerPrice, somos_nos: winnerIsUs } : null,
            preco_para_ganhar: priceToWin,
            preco_para_ganhar_tratamento: 'SINAL do Mercado Livre — não é preço obrigatório nem meta automática',
          }
        : { disponivel: false, motivo: lider.catalogo ? `HTTP ${ptw?.status}` : 'Anúncio tradicional: sem price_to_win' },
      registro_que_seria_gravado_em_competitor_offers: competition
        ? {
            product_channel_id: Number(lider.ch.product_channel_id),
            competitor_name: winnerId,
            price: winnerPrice,
            source: 'ml_price_to_win',
            observed_on: todayISO(),
            notes: 'Concorrente identificado (vencedor do catálogo) · confiança EXATA',
          }
        : null,
      referencia_oficial: referencia !== null ? { preco: referencia, confianca: 'PROVÁVEL', alimenta_recomendacao: false } : null,
      economia: {
        status: pricing.status,
        piso_economico: piso,
        ponto_equilibrio: pricing.status === 'ok' ? pricing.breakEvenPrice : null,
        margem_atual_pct: pricing.status === 'ok' ? pricing.marginPct : null,
        vencedor_acima_do_piso: pressure ? pressure.viable : null,
        leitura: pressure?.economyText ?? (pricing.status === 'ok' ? null : 'Custo ou taxa ausente: piso desconhecido.'),
      },
      classificacao: nivel,
      diferenca_para_vencedor_pct: pressure ? Math.round(pressure.gap * 10) / 10 : null,
      acoes_automaticas: 'nenhuma (sem alteração de preço, sem teste, sem recomendação gravada)',
    })
  }

  return { gerado_em: new Date().toISOString(), gravou_no_banco: false, produtos }
}

import 'server-only'
import { query } from '@/lib/db'
import { toNumber, todayISO } from '@/lib/format'
import { calculatePricing, type FeeRule } from '@/lib/pricing/engine'

type FeeRuleRow = {
  id: string
  marketplace_id: string
  name: string
  percentage_fee: string
  fixed_fee: string
  additional_fee_pct: string
  additional_fixed_fee: string
  min_price: string | null
  max_price: string | null
  category: string | null
  effective_from: string
}

export async function getActiveFeeRules(onDate = todayISO()) {
  const rows = await query<FeeRuleRow>(
    `SELECT id, marketplace_id, name, percentage_fee, fixed_fee, additional_fee_pct,
            additional_fixed_fee, min_price, max_price, category,
            to_char(effective_from, 'YYYY-MM-DD') AS effective_from
       FROM fee_rules
      WHERE active AND effective_from <= $1::date
        AND (effective_to IS NULL OR effective_to >= $1::date)`,
    [onDate],
  )
  const byMarketplace = new Map<number, FeeRule[]>()
  for (const r of rows) {
    const mid = Number(r.marketplace_id)
    const list = byMarketplace.get(mid) ?? []
    list.push({
      id: Number(r.id),
      name: r.name,
      percentageFee: Number(r.percentage_fee),
      fixedFee: Number(r.fixed_fee),
      additionalFeePct: Number(r.additional_fee_pct),
      additionalFixedFee: Number(r.additional_fixed_fee),
      minPrice: toNumber(r.min_price),
      maxPrice: toNumber(r.max_price),
      category: r.category,
      effectiveFrom: r.effective_from,
    })
    byMarketplace.set(mid, list)
  }
  return byMarketplace
}

/** Real Mercado Livre costs quoted for this specific listing (db/011). */
export type RealFees = {
  channelId: number
  listingTypeId: string | null
  logisticType: string | null
  saleFeePct: number
  saleFeeFixed: number
  shippingCost: number | null
  syncedOn: string
}

/** Real per-listing ML fees; empty before db/011 runs or before the first sync quotes them. */
export async function getChannelFees(channelIds?: number[]) {
  const map = new Map<number, RealFees>()
  const ready = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'product_channels' AND column_name = 'sale_fee_pct') AS ok`,
  )
  if (!ready[0]?.ok) return map
  const rows = await query<{
    id: string
    listing_type_id: string | null
    logistic_type: string | null
    sale_fee_pct: string
    sale_fee_fixed: string | null
    shipping_cost: string | null
    synced_on: string
  }>(
    `SELECT id, listing_type_id, logistic_type, sale_fee_pct, sale_fee_fixed, shipping_cost,
            to_char(fees_synced_at, 'YYYY-MM-DD') AS synced_on
       FROM product_channels
      WHERE sale_fee_pct IS NOT NULL ${channelIds ? 'AND id = ANY($1::bigint[])' : ''}`,
    channelIds ? [channelIds] : [],
  )
  for (const r of rows) {
    map.set(Number(r.id), {
      channelId: Number(r.id),
      listingTypeId: r.listing_type_id,
      logisticType: r.logistic_type,
      saleFeePct: Number(r.sale_fee_pct),
      saleFeeFixed: Number(r.sale_fee_fixed ?? 0),
      shippingCost: toNumber(r.shipping_cost),
      syncedOn: r.synced_on,
    })
  }
  return map
}

const LISTING_TYPE_LABEL: Record<string, string> = { gold_pro: 'Premium', gold_special: 'Clássico', free: 'Grátis' }
const pctLabel = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function realFeeRule(f: RealFees): FeeRule {
  const type = (f.listingTypeId && LISTING_TYPE_LABEL[f.listingTypeId]) || f.listingTypeId || 'anúncio'
  const envio = f.logisticType === 'fulfillment' ? 'Full' : 'envio'
  const parts = [`${type} ${pctLabel(f.saleFeePct)}`]
  if (f.saleFeeFixed > 0) parts.push(`fixa ${brl(f.saleFeeFixed)}`)
  parts.push(f.shippingCost === null ? 'frete não obtido' : `frete ${envio} ${brl(f.shippingCost)}`)
  return {
    id: -f.channelId,
    name: `Tarifa real ML (${parts.join(' + ')}) · ${f.syncedOn}`,
    percentageFee: f.saleFeePct,
    fixedFee: f.saleFeeFixed,
    additionalFeePct: 0,
    additionalFixedFee: f.shippingCost ?? 0,
    minPrice: null,
    maxPrice: null,
    category: null,
    effectiveFrom: f.syncedOn,
  }
}

export type ChannelForPricing = {
  marketplaceId: number
  price: number
  adsCostPct: number
  sellerDiscount: number
  category: string | null
  cost: number | null
  /** When present, replaces the manual fee rules with the costs ML quoted for this listing. */
  realFees?: RealFees | null
}

export function priceChannel(
  channel: ChannelForPricing,
  rulesByMarketplace: Map<number, FeeRule[]>,
  targetMarginPct: number,
  minMarginPct?: number,
) {
  return calculatePricing({
    price: channel.price,
    cost: channel.cost,
    adsCostPct: channel.adsCostPct,
    sellerDiscount: channel.sellerDiscount,
    category: channel.category,
    rules: channel.realFees ? [realFeeRule(channel.realFees)] : (rulesByMarketplace.get(channel.marketplaceId) ?? []),
    targetMarginPct,
    minMarginPct,
  })
}

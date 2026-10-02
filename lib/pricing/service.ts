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

export type ChannelForPricing = {
  marketplaceId: number
  price: number
  adsCostPct: number
  sellerDiscount: number
  category: string | null
  cost: number | null
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
    rules: rulesByMarketplace.get(channel.marketplaceId) ?? [],
    targetMarginPct,
    minMarginPct,
  })
}

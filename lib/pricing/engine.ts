export type FeeRule = {
  id: number
  name: string
  percentageFee: number
  fixedFee: number
  additionalFeePct: number
  additionalFixedFee: number
  minPrice: number | null
  maxPrice: number | null
  category: string | null
  effectiveFrom: string
}

export type PricingInput = {
  price: number
  cost: number | null
  adsCostPct: number
  sellerDiscount: number
  category: string | null
  rules: FeeRule[]
  targetMarginPct: number
  /** Lowest acceptable margin; defines the economic floor price. */
  minMarginPct?: number
}

export type PricingResult =
  | { status: 'missing_cost' | 'missing_fee_rule'; message: string }
  | {
      status: 'ok'
      rule: FeeRule
      grossPrice: number
      effectivePrice: number
      marketplaceFees: number
      adsCost: number
      sellerDiscount: number
      netRevenue: number
      cost: number
      contributionMargin: number
      marginPct: number
      breakEvenPrice: number | null
      targetMarginPrice: number | null
      targetMarginPct: number
      /** Price that keeps the configured minimum margin — below it, competing on price is not viable. */
      minMarginPrice: number | null
      minMarginPct: number | null
    }

const round2 = (n: number) => Math.round(n * 100) / 100

function inRange(rule: FeeRule, price: number) {
  if (rule.minPrice !== null && price < rule.minPrice) return false
  if (rule.maxPrice !== null && price > rule.maxPrice) return false
  return true
}

function categoryMatches(rule: FeeRule, category: string | null) {
  if (!rule.category) return true
  return Boolean(category) && rule.category.toLowerCase() === category!.toLowerCase()
}

/** Category-specific rules win over generic ones; then the most recent effective date. */
export function selectFeeRule(rules: FeeRule[], price: number, category: string | null) {
  const candidates = rules.filter((r) => inRange(r, price) && categoryMatches(r, category))
  candidates.sort((a, b) => {
    const spec = Number(Boolean(b.category)) - Number(Boolean(a.category))
    if (spec !== 0) return spec
    return b.effectiveFrom.localeCompare(a.effectiveFrom)
  })
  return candidates[0] ?? null
}

function variableRate(rule: FeeRule, adsCostPct: number) {
  return (rule.percentageFee + rule.additionalFeePct + adsCostPct) / 100
}

function fixedFees(rule: FeeRule) {
  return rule.fixedFee + rule.additionalFixedFee
}

/**
 * Smallest gross price that yields the desired margin over the effective price,
 * honoring fee-rule price ranges (e.g. fixed fees that change by price band).
 */
function solvePrice(input: PricingInput, cost: number, marginPct: number) {
  const solutions: number[] = []
  for (const rule of input.rules) {
    if (!categoryMatches(rule, input.category)) continue
    const denominator = 1 - variableRate(rule, input.adsCostPct) - marginPct / 100
    if (denominator <= 0) continue
    const price = input.sellerDiscount + (cost + fixedFees(rule)) / denominator
    if (inRange(rule, price) && selectFeeRule(input.rules, price, input.category)?.id === rule.id) {
      solutions.push(price)
    }
  }
  return solutions.length ? round2(Math.min(...solutions)) : null
}

export function calculatePricing(input: PricingInput): PricingResult {
  if (input.cost === null) {
    return { status: 'missing_cost', message: 'Custo do produto não cadastrado.' }
  }
  const rule = selectFeeRule(input.rules, input.price, input.category)
  if (!rule) {
    return {
      status: 'missing_fee_rule',
      message: 'Nenhuma regra de taxa vigente cobre este preço/categoria.',
    }
  }

  const effectivePrice = Math.max(0, input.price - input.sellerDiscount)
  const marketplaceFees =
    effectivePrice * ((rule.percentageFee + rule.additionalFeePct) / 100) + fixedFees(rule)
  const adsCost = effectivePrice * (input.adsCostPct / 100)
  const netRevenue = effectivePrice - marketplaceFees - adsCost
  const contributionMargin = netRevenue - input.cost
  const marginPct = effectivePrice > 0 ? (contributionMargin / effectivePrice) * 100 : 0

  return {
    status: 'ok',
    rule,
    grossPrice: round2(input.price),
    effectivePrice: round2(effectivePrice),
    marketplaceFees: round2(marketplaceFees),
    adsCost: round2(adsCost),
    sellerDiscount: round2(input.sellerDiscount),
    netRevenue: round2(netRevenue),
    cost: round2(input.cost),
    contributionMargin: round2(contributionMargin),
    marginPct: round2(marginPct),
    breakEvenPrice: solvePrice(input, input.cost, 0),
    targetMarginPrice: solvePrice(input, input.cost, input.targetMarginPct),
    targetMarginPct: input.targetMarginPct,
    minMarginPrice: input.minMarginPct !== undefined ? solvePrice(input, input.cost, input.minMarginPct) : null,
    minMarginPct: input.minMarginPct ?? null,
  }
}

/** Weighted average of active cost lots: Σ(qty × unit) / Σ qty. */
export function weightedAverageCost(lots: { quantity: number; unitCost: number }[]) {
  const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
  if (totalQty <= 0) return null
  const total = lots.reduce((s, l) => s + l.quantity * l.unitCost, 0)
  return Math.round((total / totalQty) * 10_000) / 10_000
}

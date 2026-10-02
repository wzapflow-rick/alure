import { formatBRL, formatInt, formatPct } from '@/lib/format'
import type { ChannelStats, Evidence, EvidenceDatum, Severity, Signal } from '@/lib/engine/rules'

/**
 * Commercial mix: which SKUs carry revenue and which carry volume, and whether the day's sales
 * still come from the usual places. Pure functions — run.ts loads the rows.
 *
 * Windows (all closed days, never the day in progress):
 *   recent   = last 3 closed days (evalDay-2 .. evalDay)
 *   baseline = the 28 days before that
 */

export type MixDay = {
  date: string
  productId: number
  sku: string
  name: string
  marketplaceId: number
  marketplaceName: string
  orders: number
  units: number
  revenue: number
}

export type MixVisitDay = { date: string; marketplaceId: number; visits: number }

/** Ads and promotion context per listing, used only to point at possible causes. */
export type MixListingContext = {
  adsClicksCur: number | null
  adsClicksPrev: number | null
  adsCostCur: number | null
  adsCostPrev: number | null
  promoActive: boolean
  promoEndedRecently: boolean
}

export type CommercialRole = 'revenue_motor' | 'turnover_motor' | 'high_ticket' | 'watch' | 'regular' | 'insufficient_history'

export const COMMERCIAL_ROLE_LABEL: Record<CommercialRole, string> = {
  revenue_motor: 'Motor de faturamento',
  turnover_motor: 'Motor de giro',
  high_ticket: 'Alto ticket',
  watch: 'Observação',
  regular: 'Regular',
  insufficient_history: 'Histórico insuficiente',
}

export type SkuMix = {
  productId: number
  sku: string
  name: string
  marketplaceId: number
  marketplaceName: string
  units28: number
  orders28: number
  revenue28: number
  saleDays28: number
  revenueShare: number
  unitsShare: number
  ticket: number | null
  unitsLast7: number
  lastSaleDate: string | null
  role: CommercialRole
}

export type MixSettings = { significantChangePct: number; dailyTarget: number }

export const RECENT_DAYS = 3
export const BASELINE_DAYS = 28
export const MIN_COVERAGE_DAYS = 14
/** Cumulative share that defines each motor group. */
const TURNOVER_UNITS_SHARE = 0.5
const REVENUE_CUM_SHARE = 0.6
/** Recurrence: a turnover motor sells on at least 1 of every 4 days; a revenue motor on 2+ distinct days (one-off sales never qualify). */
const TURNOVER_MIN_SALE_DAYS = 7
const REVENUE_MIN_SALE_DAYS = 2
const HIGH_TICKET_MULT = 3
/** Revenue-group share must fall to half of its usual weight. */
const MIX_SHARE_DROP = 0.5
const MIX_MIN_GROUP_SHARE = 0.15
const PRIORITY_GOAL_SHARE = 0.025
const CONCENTRATION_MIN_SHARE = 0.4
const CONCENTRATION_MIN_ORDERS = 3

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function mixWindows(today: string) {
  const evalDay = addDays(today, -1)
  const recentStart = addDays(evalDay, -(RECENT_DAYS - 1))
  const baseEnd = addDays(recentStart, -1)
  const baseStart = addDays(baseEnd, -(BASELINE_DAYS - 1))
  return { evalDay, recentStart, baseEnd, baseStart }
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to

function median(values: number[]) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function pct(n: number) {
  return formatPct(n * 100)
}

function chg(cur: number, ref: number) {
  return ref > 0 ? ((cur - ref) / ref) * 100 : null
}

function goalScore(severity: Severity, perDay: number, dailyTarget: number) {
  const base = { critical: 100, attention: 60, positive: 50, info: 20 }[severity]
  const share = dailyTarget > 0 ? Math.max(0, perDay) / dailyTarget : 0
  return base + Math.min(40, Math.round(share * 400))
}

function groupByMarketplace<T extends { marketplaceId: number }>(rows: T[]) {
  const map = new Map<number, T[]>()
  for (const r of rows) map.set(r.marketplaceId, [...(map.get(r.marketplaceId) ?? []), r])
  return map
}

/** Days of the baseline with at least one sale in the marketplace — how much history the mix stands on. */
export function coverageDays(rows: MixDay[], today: string) {
  const w = mixWindows(today)
  return new Set(rows.filter((r) => r.orders > 0 && inRange(r.date, w.baseStart, w.baseEnd)).map((r) => r.date)).size
}

/**
 * Commercial role per SKU and marketplace, from the 28 baseline days compared with the rest of
 * the operation — never from fixed amounts. Short history means no role.
 */
export function commercialRoles(rows: MixDay[], today: string): SkuMix[] {
  const w = mixWindows(today)
  const out: SkuMix[] = []
  for (const [, mRows] of groupByMarketplace(rows)) {
    const coverage = coverageDays(mRows, today)
    const bySku = new Map<number, MixDay[]>()
    for (const r of mRows) bySku.set(r.productId, [...(bySku.get(r.productId) ?? []), r])

    const skus: SkuMix[] = [...bySku.values()].map((list) => {
      const base = list.filter((r) => inRange(r.date, w.baseStart, w.baseEnd))
      const sold = list.filter((r) => r.orders > 0 && r.date <= w.evalDay).map((r) => r.date).sort()
      const units28 = base.reduce((s, r) => s + r.units, 0)
      const revenue28 = base.reduce((s, r) => s + r.revenue, 0)
      return {
        productId: list[0].productId,
        sku: list[0].sku,
        name: list[0].name,
        marketplaceId: list[0].marketplaceId,
        marketplaceName: list[0].marketplaceName,
        units28,
        orders28: base.reduce((s, r) => s + r.orders, 0),
        revenue28,
        saleDays28: new Set(base.filter((r) => r.orders > 0).map((r) => r.date)).size,
        revenueShare: 0,
        unitsShare: 0,
        ticket: units28 > 0 ? revenue28 / units28 : null,
        unitsLast7: list.filter((r) => inRange(r.date, addDays(w.evalDay, -6), w.evalDay)).reduce((s, r) => s + r.units, 0),
        lastSaleDate: sold.length ? sold[sold.length - 1] : null,
        role: 'regular' as CommercialRole,
      }
    })

    const totalUnits = skus.reduce((s, x) => s + x.units28, 0)
    const totalRevenue = skus.reduce((s, x) => s + x.revenue28, 0)
    for (const x of skus) {
      x.unitsShare = totalUnits > 0 ? x.units28 / totalUnits : 0
      x.revenueShare = totalRevenue > 0 ? x.revenue28 / totalRevenue : 0
    }

    if (coverage < MIN_COVERAGE_DAYS) {
      for (const x of skus) x.role = 'insufficient_history'
      out.push(...skus)
      continue
    }

    let cum = 0
    for (const x of [...skus].sort((a, b) => b.units28 - a.units28)) {
      if (cum >= TURNOVER_UNITS_SHARE || x.units28 <= 0) break
      if (x.saleDays28 >= TURNOVER_MIN_SALE_DAYS) x.role = 'turnover_motor'
      cum += x.unitsShare
    }

    cum = 0
    for (const x of [...skus].sort((a, b) => b.revenue28 - a.revenue28)) {
      if (cum >= REVENUE_CUM_SHARE || x.revenue28 <= 0) break
      if (x.role === 'regular' && x.saleDays28 >= REVENUE_MIN_SALE_DAYS) x.role = 'revenue_motor'
      cum += x.revenueShare
    }

    const medTicket = median(skus.filter((x) => x.ticket !== null).map((x) => x.ticket!))
    for (const x of skus) {
      if (x.role !== 'regular') continue
      if (x.ticket !== null && medTicket > 0 && x.ticket >= medTicket * HIGH_TICKET_MULT) x.role = 'high_ticket'
      else if (x.unitsLast7 >= 3 && x.unitsLast7 >= 2 * (x.units28 / 4)) x.role = 'watch'
    }
    out.push(...skus)
  }
  return out
}

type DayTotals = { orders: number; units: number; revenue: number }

function sumBy(rows: MixDay[], pick: (r: MixDay) => boolean): DayTotals {
  return rows.filter(pick).reduce((a, r) => ({ orders: a.orders + r.orders, units: a.units + r.units, revenue: a.revenue + r.revenue }), { orders: 0, units: 0, revenue: 0 })
}

export type MixSnapshot = {
  marketplaceId: number
  marketplaceName: string
  coverage: number
  baselinePerDay: DayTotals & { visits: number | null }
  recentPerDay: DayTotals & { visits: number | null }
  revenueGroupShareBase: number
  revenueGroupShareRecent: number
  turnoverUnitsBase: number
  turnoverUnitsRecent: number
  top3ShareBase: number
  top3ShareRecent: number
  top5ShareBase: number
  top5ShareRecent: number
}

function topShare(rows: MixDay[], n: number, total: number) {
  if (total <= 0) return 0
  const by = new Map<number, number>()
  for (const r of rows) by.set(r.productId, (by.get(r.productId) ?? 0) + r.revenue)
  return [...by.values()].sort((a, b) => b - a).slice(0, n).reduce((s, v) => s + v, 0) / total
}

/** Revenue mix of the recent closed days against the 28-day average, per marketplace. */
export function mixSnapshot(rows: MixDay[], visits: MixVisitDay[], roles: SkuMix[], today: string): MixSnapshot[] {
  const w = mixWindows(today)
  const roleOf = new Map(roles.map((r) => [`${r.marketplaceId}:${r.productId}`, r.role]))
  const isRevenueGroup = (r: MixDay) => {
    const role = roleOf.get(`${r.marketplaceId}:${r.productId}`)
    return role === 'revenue_motor' || role === 'high_ticket'
  }
  const isTurnover = (r: MixDay) => roleOf.get(`${r.marketplaceId}:${r.productId}`) === 'turnover_motor'
  const visitsBy = groupByMarketplace(visits)

  return [...groupByMarketplace(rows)].map(([marketplaceId, mRows]) => {
    const base = mRows.filter((r) => inRange(r.date, w.baseStart, w.baseEnd))
    const recent = mRows.filter((r) => inRange(r.date, w.recentStart, w.evalDay))
    const b = sumBy(base, () => true)
    const c = sumBy(recent, () => true)
    const v = visitsBy.get(marketplaceId) ?? []
    const vBaseDays = new Set(v.filter((x) => inRange(x.date, w.baseStart, w.baseEnd)).map((x) => x.date)).size
    const vRecent = v.filter((x) => inRange(x.date, w.recentStart, w.evalDay))
    const visitsBase = vBaseDays >= MIN_COVERAGE_DAYS ? v.filter((x) => inRange(x.date, w.baseStart, w.baseEnd)).reduce((s, x) => s + x.visits, 0) / vBaseDays : null
    const visitsRecent = visitsBase !== null && vRecent.length ? vRecent.reduce((s, x) => s + x.visits, 0) / RECENT_DAYS : null
    const gb = sumBy(base, isRevenueGroup).revenue
    const gc = sumBy(recent, isRevenueGroup).revenue
    return {
      marketplaceId,
      marketplaceName: mRows[0].marketplaceName,
      coverage: coverageDays(mRows, today),
      baselinePerDay: { orders: b.orders / BASELINE_DAYS, units: b.units / BASELINE_DAYS, revenue: b.revenue / BASELINE_DAYS, visits: visitsBase },
      recentPerDay: { orders: c.orders / RECENT_DAYS, units: c.units / RECENT_DAYS, revenue: c.revenue / RECENT_DAYS, visits: visitsRecent },
      revenueGroupShareBase: b.revenue > 0 ? gb / b.revenue : 0,
      revenueGroupShareRecent: c.revenue > 0 ? gc / c.revenue : 0,
      turnoverUnitsBase: sumBy(base, isTurnover).units / BASELINE_DAYS,
      turnoverUnitsRecent: sumBy(recent, isTurnover).units / RECENT_DAYS,
      top3ShareBase: topShare(base, 3, b.revenue),
      top3ShareRecent: topShare(recent, 3, c.revenue),
      top5ShareBase: topShare(base, 5, b.revenue),
      top5ShareRecent: topShare(recent, 5, c.revenue),
    }
  })
}

export type MixInput = {
  today: string
  rows: MixDay[]
  visits: MixVisitDay[]
  /** Primary listings already loaded by the engine — reused for the cause checklist. */
  channels: ChannelStats[]
  context?: Map<number, MixListingContext>
  settings: MixSettings
}

/** Possible causes for a SKU that stopped selling, from data already in the database. Never a verdict. */
function causeChecklist(channel: ChannelStats | undefined, ctx: MixListingContext | undefined, today: string, sig: number): Evidence[] {
  if (!channel) return [{ label: 'FATO', text: 'Nenhum anúncio ativo encontrado para o SKU neste marketplace: verificar status (pausado, inativo ou sob revisão).' }]
  const out: Evidence[] = []
  if (channel.visitsCur === null) out.push({ label: 'FATO', text: 'Visitas não sincronizadas: não é possível separar tráfego de conversão.' })
  else {
    const v = chg(channel.visitsCur, channel.visitsPrev ?? 0)
    out.push({ label: 'FATO', text: `Visitas: ${formatInt(channel.visitsPrev)} → ${formatInt(channel.visitsCur)} (${channel.windowDays}d)${v !== null ? ` · ${formatPct(v, true)}` : ''}.` })
    if (v !== null && v <= -sig) out.push({ label: 'INTERPRETAÇÃO', text: 'Tráfego caiu: começar por exposição, posição e Ads.' })
    else if (channel.visitsCur > 0) {
      const conv = (channel.ordersCur / channel.visitsCur) * 100
      const convPrev = channel.visitsPrev ? (channel.ordersPrev / channel.visitsPrev) * 100 : null
      out.push({ label: 'FATO', text: `Conversão: ${convPrev !== null ? `${formatPct(convPrev)} → ` : ''}${formatPct(conv)}.` })
    }
  }
  if (channel.lastPriceChange && diffDays(channel.lastPriceChange.date, today) <= 14) {
    out.push({ label: 'FATO', text: `Preço alterado em ${channel.lastPriceChange.date.split('-').reverse().join('/')}: ${formatBRL(channel.lastPriceChange.previous)} → ${formatBRL(channel.lastPriceChange.price)}.` })
  }
  if (channel.competition) {
    const cheap = channel.competition.cheapest
    if (cheap.price < channel.price) out.push({ label: 'FATO', text: `Oferta concorrente observada a ${formatBRL(cheap.price)} (nosso preço ${formatBRL(channel.price)}). Avaliar pela regra de concorrência e pelo piso econômico — nunca igualar sem checar margem.` })
  }
  if (channel.stock === 0) out.push({ label: 'FATO', text: 'Estoque zerado no marketplace.' })
  if (ctx) {
    if (ctx.adsClicksCur !== null && ctx.adsClicksPrev !== null) {
      const a = chg(ctx.adsClicksCur, ctx.adsClicksPrev)
      out.push({ label: 'FATO', text: `Ads: cliques ${formatInt(ctx.adsClicksPrev)} → ${formatInt(ctx.adsClicksCur)}${a !== null ? ` (${formatPct(a, true)})` : ''}; investimento ${formatBRL(ctx.adsCostPrev)} → ${formatBRL(ctx.adsCostCur)} (7d).` })
    }
    if (ctx.promoEndedRecently && !ctx.promoActive) out.push({ label: 'FATO', text: 'Promoção encerrada recentemente.' })
    else if (ctx.promoActive) out.push({ label: 'FATO', text: 'Promoção ativa no anúncio.' })
  }
  return out
}

/**
 * Mix signals — investigation only (suggestsChange: false):
 *   R15_MIX_RISK              revenue motors lost weight while orders, traffic and turnover motors held
 *   R16_CONCENTRATION         one SKU carries an abnormal share of recent revenue
 *   R17_REVENUE_MOTOR_ABSENT  a recurrent revenue motor stopped selling beyond its usual interval
 */
export function evaluateMix(input: MixInput): { signals: Signal[]; roles: SkuMix[]; snapshots: MixSnapshot[] } {
  const { today, rows, visits, channels, settings } = input
  const sig = settings.significantChangePct
  const w = mixWindows(today)
  const roles = commercialRoles(rows, today)
  const snapshots = mixSnapshot(rows, visits, roles, today)
  const signals: Signal[] = []
  const channelBy = new Map(channels.map((c) => [`${c.marketplaceId}:${c.productId}`, c]))

  for (const snap of snapshots) {
    if (snap.coverage < MIN_COVERAGE_DAYS) continue
    const mRows = rows.filter((r) => r.marketplaceId === snap.marketplaceId)
    const mRoles = roles.filter((r) => r.marketplaceId === snap.marketplaceId)
    const revenueGroup = mRoles.filter((r) => r.role === 'revenue_motor' || r.role === 'high_ticket')
    const turnover = mRoles.filter((r) => r.role === 'turnover_motor')
    const absentMotors: string[] = []

    for (const m of mRoles.filter((r) => r.role === 'revenue_motor')) {
      const interval = BASELINE_DAYS / Math.max(1, m.saleDays28)
      const since = m.lastSaleDate ? diffDays(m.lastSaleDate, w.evalDay) : BASELINE_DAYS + RECENT_DAYS
      const limit = Math.max(RECENT_DAYS, Math.ceil(interval * 2))
      if (since < limit) continue
      absentMotors.push(m.sku || m.name)
      const channel = channelBy.get(`${m.marketplaceId}:${m.productId}`)
      const severity: Severity = m.revenueShare >= 0.05 ? 'attention' : 'info'
      const title = `${m.sku || m.name} · ${m.marketplaceName}`
      const expectedPerDay = m.revenue28 / BASELINE_DAYS
      signals.push({
        fingerprint: `R17:${m.marketplaceId}:${m.productId}`,
        ruleCode: 'R17_REVENUE_MOTOR_ABSENT',
        kind: 'no_action',
        severity,
        actionType: 'information',
        confidence: m.saleDays28 >= 6 ? 'medium' : 'low',
        score: goalScore(severity, expectedPerDay, settings.dailyTarget),
        productId: m.productId,
        productChannelId: channel?.productChannelId ?? null,
        marketplaceId: m.marketplaceId,
        experimentId: null,
        title,
        issue: `Motor de faturamento sem venda há ${formatInt(since)} dias; o normal é vender a cada ${formatInt(Math.round(interval))}.`,
        evidence: [
          { label: 'FATO', text: `28 dias de referência: ${formatInt(m.orders28)} pedidos em ${formatInt(m.saleDays28)} dias, ${formatBRL(m.revenue28)} (${pct(m.revenueShare)} do faturamento).` },
          { label: 'FATO', text: `Última venda: ${m.lastSaleDate ? m.lastSaleDate.split('-').reverse().join('/') : 'nenhuma no período'}.` },
          ...causeChecklist(channel, channel ? input.context?.get(channel.productChannelId) : undefined, today, sig),
          { label: 'HIPÓTESE', text: 'A causa ainda não está confirmada; os itens acima são o roteiro de investigação.' },
        ],
        data: [
          { label: 'Função', value: COMMERCIAL_ROLE_LABEL.revenue_motor },
          { label: 'Dias sem venda', value: formatInt(since) },
          { label: 'Intervalo normal', value: `${formatInt(Math.round(interval))} dias` },
          { label: 'Faturamento médio', value: `${formatBRL(expectedPerDay)}/dia` },
          { label: 'Status', value: 'INVESTIGAR' },
        ],
        recommendation: 'Investigar na ordem: status do anúncio → visitas → conversão → preço e concorrência → Ads → promoção.',
        reason: 'O produto costuma sustentar o faturamento e parou fora do seu intervalo normal.',
        objective: 'Confirmar a causa antes de qualquer mudança comercial.',
        suggestsChange: false,
        alert: { type: 'revenue_motor_absent', severity, message: `${title}: sem venda há ${formatInt(since)} dias (normal: a cada ${formatInt(Math.round(interval))}).` },
        trace: [`Motor de faturamento ausente: ${since}d sem venda, limite ${limit}d.`],
      })
    }

    const ordersChg = chg(snap.recentPerDay.orders, snap.baselinePerDay.orders)
    const visitsChg = snap.recentPerDay.visits !== null && snap.baselinePerDay.visits !== null ? chg(snap.recentPerDay.visits, snap.baselinePerDay.visits) : null
    const turnoverChg = chg(snap.turnoverUnitsRecent, snap.turnoverUnitsBase)
    const demandOk = ordersChg !== null && ordersChg > -sig
    const trafficOk = visitsChg === null || visitsChg > -sig
    const turnoverOk = turnover.length > 0 && turnoverChg !== null && turnoverChg > -sig
    const shareFell =
      snap.revenueGroupShareBase >= MIX_MIN_GROUP_SHARE && snap.revenueGroupShareRecent <= snap.revenueGroupShareBase * MIX_SHARE_DROP

    if (demandOk && trafficOk && turnoverOk && shareFell) {
      const groupIds = new Set(revenueGroup.map((r) => r.productId))
      const groupBasePerDay = snap.baselinePerDay.revenue * snap.revenueGroupShareBase
      const recentDays = [0, 1, 2].map((i) => addDays(w.recentStart, i))
      const weakDays = recentDays.filter((d) => mRows.filter((r) => r.date === d && groupIds.has(r.productId)).reduce((s, r) => s + r.revenue, 0) < groupBasePerDay * MIX_SHARE_DROP).length
      const groupRecentPerDay = snap.recentPerDay.revenue * snap.revenueGroupShareRecent
      const lostPerDay = Math.max(0, groupBasePerDay - groupRecentPerDay)
      const elevated = weakDays >= 2 && lostPerDay >= settings.dailyTarget * PRIORITY_GOAL_SHARE
      const name = snap.marketplaceName
      const absentText = absentMotors.length ? ` ${formatInt(absentMotors.length)} motor${absentMotors.length === 1 ? '' : 'es'} de faturamento abaixo do ritmo histórico (${absentMotors.join(', ')}).` : ''
      const data: EvidenceDatum[] = [
        { label: 'Pedidos/dia', value: `${formatInt(snap.baselinePerDay.orders)} → ${formatInt(snap.recentPerDay.orders)}${ordersChg !== null ? ` (${formatPct(ordersChg, true)})` : ''}` },
        { label: 'Visitas/dia', value: snap.baselinePerDay.visits !== null && snap.recentPerDay.visits !== null ? `${formatInt(snap.baselinePerDay.visits)} → ${formatInt(snap.recentPerDay.visits)}` : 'não sincronizadas' },
        { label: 'Faturamento/dia', value: `${formatBRL(snap.baselinePerDay.revenue)} → ${formatBRL(snap.recentPerDay.revenue)}` },
        { label: 'Peso dos motores de faturamento', value: `${pct(snap.revenueGroupShareBase)} → ${pct(snap.revenueGroupShareRecent)}` },
        { label: 'Motores de giro (un/dia)', value: `${formatInt(snap.turnoverUnitsBase)} → ${formatInt(snap.turnoverUnitsRecent)}` },
        { label: 'Top 3 / Top 5', value: `${pct(snap.top3ShareBase)} → ${pct(snap.top3ShareRecent)} · ${pct(snap.top5ShareBase)} → ${pct(snap.top5ShareRecent)}` },
        { label: 'Dias fracos', value: `${formatInt(weakDays)} de ${RECENT_DAYS}` },
        { label: 'Status', value: 'INVESTIGAR' },
      ]
      signals.push({
        fingerprint: `R15:${snap.marketplaceId}`,
        ruleCode: 'R15_MIX_RISK',
        kind: elevated ? 'priority' : 'no_action',
        severity: 'attention',
        actionType: 'information',
        confidence: weakDays >= 3 ? 'high' : weakDays >= 2 ? 'medium' : 'low',
        score: goalScore('attention', lostPerDay, settings.dailyTarget) + (elevated ? 5 : 0),
        productId: null,
        productChannelId: null,
        marketplaceId: snap.marketplaceId,
        experimentId: null,
        title: `Mix comercial · ${name}`,
        issue: `Volume mantido, mas o faturamento está vindo dos motores de giro: o peso dos motores de faturamento caiu de ${pct(snap.revenueGroupShareBase)} para ${pct(snap.revenueGroupShareRecent)}.${absentText}`,
        evidence: [
          { label: 'FATO', text: `Últimos ${RECENT_DAYS} dias fechados contra a média de ${BASELINE_DAYS} dias. Pedidos ${ordersChg !== null ? formatPct(ordersChg, true) : '—'}, visitas ${visitsChg !== null ? formatPct(visitsChg, true) : 'não sincronizadas'}, motores de giro ${turnoverChg !== null ? formatPct(turnoverChg, true) : '—'}.` },
          { label: 'INTERPRETAÇÃO', text: 'Demanda e tráfego estão normais; o que mudou foi a composição das vendas (mix), não o volume.' },
          { label: 'HIPÓTESE', text: 'Motores de faturamento podem ter perdido exposição, competitividade ou disponibilidade. Ver os alertas "Motor de faturamento ausente" para cada SKU.' },
        ],
        data,
        recommendation: `Investigar mix: revisar os motores de faturamento de ${name} um a um (status, visitas, conversão, preço, concorrência, Ads, promoção). Não mexer em preço sem checar o piso econômico.`,
        reason: 'Faturamento depende de poucos produtos de ticket alto; a ausência deles derruba a meta mesmo com pedidos normais.',
        objective: 'Recuperar o peso dos motores de faturamento no faturamento diário.',
        suggestsChange: false,
        alert: { type: 'mix_risk', severity: 'attention', message: `${name}: volume normal, mas motores de faturamento caíram de ${pct(snap.revenueGroupShareBase)} para ${pct(snap.revenueGroupShareRecent)} do faturamento.${absentText}` },
        trace: [`Mix: grupo ${pct(snap.revenueGroupShareBase)} → ${pct(snap.revenueGroupShareRecent)}, dias fracos ${weakDays}, perda ${Math.round(lostPerDay)}/dia, ${elevated ? 'prioridade' : 'alerta'}.`],
      })
    }

    const recent = mRows.filter((r) => inRange(r.date, w.recentStart, w.evalDay))
    const recentOrders = recent.reduce((s, r) => s + r.orders, 0)
    const recentRevenue = recent.reduce((s, r) => s + r.revenue, 0)
    if (recentOrders >= CONCENTRATION_MIN_ORDERS && recentRevenue > 0) {
      const by = new Map<number, number>()
      for (const r of recent) by.set(r.productId, (by.get(r.productId) ?? 0) + r.revenue)
      for (const [productId, rev] of by) {
        const share = rev / recentRevenue
        const role = mRoles.find((r) => r.productId === productId)
        const baseShare = role?.revenueShare ?? 0
        if (share < CONCENTRATION_MIN_SHARE || share < baseShare * 2) continue
        const channel = channelBy.get(`${snap.marketplaceId}:${productId}`)
        const label = role?.sku || role?.name || `Produto ${productId}`
        signals.push({
          fingerprint: `R16:${snap.marketplaceId}:${productId}`,
          ruleCode: 'R16_CONCENTRATION',
          kind: 'no_action',
          severity: 'info',
          actionType: 'information',
          confidence: recentOrders >= 10 ? 'medium' : 'low',
          score: goalScore('info', 0, settings.dailyTarget),
          productId,
          productChannelId: channel?.productChannelId ?? null,
          marketplaceId: snap.marketplaceId,
          experimentId: null,
          title: `${label} · ${snap.marketplaceName}`,
          issue: `${label} concentrou ${pct(share)} do faturamento dos últimos ${RECENT_DAYS} dias; o normal é ${pct(baseShare)}.`,
          evidence: [
            { label: 'FATO', text: `${formatBRL(rev)} de ${formatBRL(recentRevenue)} em ${formatInt(recentOrders)} pedidos nos últimos ${RECENT_DAYS} dias fechados.` },
            { label: 'INTERPRETAÇÃO', text: 'Risco de dependência: se este produto parar, o faturamento cai junto.' },
          ],
          data: [
            { label: 'Participação recente', value: pct(share) },
            { label: 'Participação em 28 dias', value: pct(baseShare) },
            { label: 'Função', value: role ? COMMERCIAL_ROLE_LABEL[role.role] : '—' },
          ],
          recommendation: 'Acompanhar. Confirmar estoque deste produto e verificar por que os demais perderam participação.',
          reason: 'Concentração fora do padrão aumenta o risco da meta diária.',
          objective: 'Reduzir a dependência de um único produto.',
          suggestsChange: false,
          alert: { type: 'concentration', severity: 'info', message: `${label} concentra ${pct(share)} do faturamento recente (normal: ${pct(baseShare)}).` },
          trace: [`Concentração: ${pct(share)} vs ${pct(baseShare)}.`],
        })
      }
    }
  }
  return { signals, roles, snapshots }
}

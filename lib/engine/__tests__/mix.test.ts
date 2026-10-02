import { describe, expect, it } from 'vitest'
import { addDays, commercialRoles, evaluateMix, mixWindows, type MixDay, type MixVisitDay } from '@/lib/engine/mix'

const TODAY = '2026-10-03'
const W = mixWindows(TODAY)
const SETTINGS = { significantChangePct: 20, dailyTarget: 10_000 }

type Sku = { id: number; sku: string; ticket: number; every: number; units?: number }

const G1: Sku = { id: 1, sku: 'G1', ticket: 70, every: 1, units: 3 }
const G2: Sku = { id: 2, sku: 'G2', ticket: 40, every: 1, units: 3 }
const F1: Sku = { id: 3, sku: 'F1', ticket: 3000, every: 3 }
const F2: Sku = { id: 4, sku: 'F2', ticket: 2500, every: 4 }
const F3: Sku = { id: 5, sku: 'F3', ticket: 2000, every: 5 }
const CATALOG = [G1, G2, F1, F2, F3]

function day(s: Sku, date: string, units: number): MixDay {
  return { date, productId: s.id, sku: s.sku, name: s.sku, marketplaceId: 1, marketplaceName: 'Mercado Livre', orders: units, units, revenue: units * s.ticket }
}

function dates(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Normal pattern: each SKU sells `units` every `every` days. */
function history(skus: Sku[], from: string, to: string) {
  return dates(from, to).flatMap((d, i) => skus.filter((s) => i % s.every === 0).map((s) => day(s, d, s.units ?? 1)))
}

function visits(from: string, to: string, perDay: number): MixVisitDay[] {
  return dates(from, to).map((date) => ({ date, marketplaceId: 1, visits: perDay }))
}

const baseline = () => history(CATALOG, W.baseStart, W.baseEnd)
const baseVisits = () => visits(W.baseStart, W.baseEnd, 400)

function run(rows: MixDay[], v: MixVisitDay[]) {
  return evaluateMix({ today: TODAY, rows, visits: v, channels: [], settings: SETTINGS })
}
const codes = (r: ReturnType<typeof run>) => r.signals.map((s) => s.ruleCode)

describe('mix comercial', () => {
  it('classifica giro e faturamento pelo comportamento de 28 dias', () => {
    const roles = commercialRoles(baseline(), TODAY)
    const role = (sku: string) => roles.find((r) => r.sku === sku)?.role
    expect(role('G1')).toBe('turnover_motor')
    expect(role('G2')).toBe('turnover_motor')
    expect(role('F1')).toBe('revenue_motor')
    expect(role('F2')).toBe('revenue_motor')
  })

  it('1 · giro e faturamento normais → sem alerta', () => {
    const r = run([...baseline(), ...history(CATALOG, W.recentStart, W.evalDay)], [...baseVisits(), ...visits(W.recentStart, W.evalDay, 400)])
    expect(codes(r)).not.toContain('R15_MIX_RISK')
    expect(codes(r)).not.toContain('R17_REVENUE_MOTOR_ABSENT')
  })

  it('2 · giro vende e motores de faturamento somem → MIX_COMERCIAL_RISCO', () => {
    const r = run([...baseline(), ...history([G1, G2], W.recentStart, W.evalDay)], [...baseVisits(), ...visits(W.recentStart, W.evalDay, 400)])
    const mix = r.signals.find((s) => s.ruleCode === 'R15_MIX_RISK')
    expect(mix).toBeDefined()
    expect(mix!.kind).toBe('priority')
    expect(mix!.suggestsChange).toBe(false)
    expect(mix!.alert?.type).toBe('mix_risk')
  })

  it('3 · tudo cai junto com as visitas → demanda/tráfego, não mix', () => {
    const r = run(
      [...baseline(), ...history([{ ...G1, units: 1 }], W.recentStart, W.evalDay)],
      [...baseVisits(), ...visits(W.recentStart, W.evalDay, 150)],
    )
    expect(codes(r)).not.toContain('R15_MIX_RISK')
  })

  it('4 · visitas normais e pedidos em queda → conversão, não mix', () => {
    const r = run(
      [...baseline(), ...history([{ ...G1, units: 1 }], W.recentStart, W.evalDay)],
      [...baseVisits(), ...visits(W.recentStart, W.evalDay, 400)],
    )
    expect(codes(r)).not.toContain('R15_MIX_RISK')
  })

  it('5 · um produto concentra o faturamento fora do padrão → dependência', () => {
    const X: Sku = { id: 9, sku: 'X', ticket: 5000, every: 1 }
    const rows = [...baseline(), day(X, W.baseStart, 1), ...history([G1, G2], W.recentStart, W.evalDay), ...history([X], W.recentStart, W.evalDay)]
    const r = run(rows, [...baseVisits(), ...visits(W.recentStart, W.evalDay, 400)])
    const c = r.signals.find((s) => s.ruleCode === 'R16_CONCENTRATION' && s.productId === 9)
    expect(c).toBeDefined()
    expect(c!.kind).toBe('no_action')
  })

  it('6 · histórico insuficiente → não classifica nem alerta', () => {
    const short = history(CATALOG, addDays(W.baseEnd, -9), W.baseEnd)
    const r = run([...short, ...history([G1, G2], W.recentStart, W.evalDay)], visits(addDays(W.baseEnd, -9), W.evalDay, 400))
    expect(r.roles.every((x) => x.role === 'insufficient_history')).toBe(true)
    expect(r.signals).toHaveLength(0)
  })

  it('7 · motor de faturamento parado alerta e some quando volta a vender', () => {
    const stopFrom = addDays(W.evalDay, -12)
    const rows = [...baseline(), ...history(CATALOG, W.recentStart, W.evalDay)].filter((r) => !(r.productId === F1.id && r.date >= stopFrom))
    const stopped = run(rows, baseVisits())
    expect(stopped.signals.some((s) => s.ruleCode === 'R17_REVENUE_MOTOR_ABSENT' && s.productId === F1.id)).toBe(true)

    const back = run([...rows, day(F1, W.evalDay, 1)], baseVisits())
    expect(back.signals.some((s) => s.ruleCode === 'R17_REVENUE_MOTOR_ABSENT' && s.productId === F1.id)).toBe(false)
  })

  it('8 · giro explode mas motores de faturamento seguem normais → sem falso positivo', () => {
    const r = run(
      [...baseline(), ...history([{ ...G1, units: 30 }, G2, F1, F2, F3], W.recentStart, W.evalDay)],
      [...baseVisits(), ...visits(W.recentStart, W.evalDay, 400)],
    )
    expect(codes(r)).not.toContain('R15_MIX_RISK')
  })

  it('caso real 02/10 · venda avulsa não vira motor; giro e recorrentes sim', () => {
    const real: Sku[] = [
      { id: 11, sku: '4906.303', ticket: 87, every: 1, units: 4 },
      { id: 12, sku: '2060.C83', ticket: 215, every: 3, units: 5 },
      { id: 13, sku: '1180.C.NG', ticket: 12_095, every: 99 },
      { id: 14, sku: 'KLS-2580.E', ticket: 2200, every: 14, units: 2 },
      { id: 15, sku: '4906.ACT.BR', ticket: 87, every: 2, units: 2 },
    ]
    const roles = commercialRoles(history(real, W.baseStart, W.baseEnd), TODAY)
    const role = (sku: string) => roles.find((r) => r.sku === sku)?.role
    expect(role('4906.303')).toBe('turnover_motor')
    expect(role('1180.C.NG')).not.toBe('revenue_motor')
    expect(role('2060.C83')).toBe('revenue_motor')
    expect(['revenue_motor', 'high_ticket']).toContain(role('KLS-2580.E'))
  })
})

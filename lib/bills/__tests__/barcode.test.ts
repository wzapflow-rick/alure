import { describe, expect, it } from 'vitest'
import { bankBarcodeDv, dueDateFromFactor, mod10, parseBoleto } from '@/lib/bills/barcode'
import { addMonthsISO, billState, parseMoneyInput } from '@/lib/bills/constants'

function buildBankLine(bank: string, factor: number, cents: number, freeField = '1234567890123456789012345') {
  const tail = String(factor).padStart(4, '0') + String(cents).padStart(10, '0')
  const head = `${bank}9`
  const dv = bankBarcodeDv(head + tail + freeField)
  const f1 = head + freeField.slice(0, 5)
  const f2 = freeField.slice(5, 15)
  const f3 = freeField.slice(15, 25)
  return `${f1}${mod10(f1)}${f2}${mod10(f2)}${f3}${mod10(f3)}${dv}${tail}`
}

function buildUtilityLine(cents: number) {
  const body = '816' + String(cents).padStart(11, '0') + '0001' + '1234567890123456789012345'
  const dv = mod10(body)
  const barcode = body.slice(0, 3) + dv + body.slice(3, 43)
  let line = ''
  for (let i = 0; i < 4; i++) {
    const block = barcode.slice(i * 11, i * 11 + 11)
    line += block + mod10(block)
  }
  return line
}

describe('boleto bancário', () => {
  it('reads amount, bank and due date after the 2025 factor restart', () => {
    const parsed = parseBoleto(buildBankLine('001', 1000, 12345), '2025-03-01')
    expect(parsed).toMatchObject({ kind: 'bancario', valid: true, amount: 123.45, bankCode: '001', dueDate: '2025-02-22' })
  })

  it('accepts the line with dots and spaces', () => {
    const line = buildBankLine('237', 1500, 99990)
    const spaced = `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)} ${line.slice(21)}`
    expect(parseBoleto(spaced, '2026-06-01')?.amount).toBe(999.9)
  })

  it('flags a mistyped digit', () => {
    const line = buildBankLine('341', 1200, 5000)
    const broken = line.slice(0, 12) + ((Number(line[12]) + 1) % 10) + line.slice(13)
    expect(parseBoleto(broken, '2026-01-01')?.valid).toBe(false)
  })

  it('uses the old base when the old date is closer', () => {
    expect(dueDateFromFactor(9000, '2022-01-01')).toBe('2022-05-29')
  })
})

describe('arrecadação', () => {
  it('reads the amount of a 48-digit line', () => {
    const parsed = parseBoleto(buildUtilityLine(25890), '2026-01-01')
    expect(parsed).toMatchObject({ kind: 'arrecadacao', valid: true, amount: 258.9, dueDate: null })
  })
})

describe('helpers', () => {
  it('parses Brazilian money input', () => {
    expect(parseMoneyInput('1.234,56')).toBe(1234.56)
    expect(parseMoneyInput('R$ 89,90')).toBe(89.9)
    expect(parseMoneyInput('1500.5')).toBe(1500.5)
  })

  it('keeps month-end dates valid when adding months', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-11-10', 3)).toBe('2027-02-10')
  })

  it('describes overdue and upcoming bills', () => {
    expect(billState({ status: 'open', due_date: '2026-10-10', paid_at: null }, '2026-10-13')).toEqual({ label: 'Vencido há 3 dias', tone: 'critical' })
    expect(billState({ status: 'open', due_date: '2026-10-13', paid_at: null }, '2026-10-13').label).toBe('Vence hoje')
  })
})

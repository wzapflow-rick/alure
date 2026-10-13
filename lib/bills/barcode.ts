/**
 * Reads Brazilian boleto codes (FEBRABAN): the 47-digit bank "linha digitável",
 * the 48-digit utility/tax line (arrecadação) and the raw 44-digit barcode.
 * Pure functions: safe to use on the client and the server.
 */

export type ParsedBoleto = {
  kind: 'bancario' | 'arrecadacao'
  digits: string
  barcode: string
  valid: boolean
  amount: number | null
  dueDate: string | null
  bankCode: string | null
}

const OLD_BASE = Date.UTC(1997, 9, 7)
// Due-date factor restarted at 1000 on 2025-02-22 after reaching 9999.
const NEW_BASE = Date.UTC(2025, 1, 22)
const DAY = 86_400_000

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function mod10(num: string) {
  let sum = 0
  let weight = 2
  for (let i = num.length - 1; i >= 0; i--) {
    let product = Number(num[i]) * weight
    if (product > 9) product = Math.floor(product / 10) + (product % 10)
    sum += product
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

function weightedMod11(num: string) {
  let sum = 0
  let weight = 2
  for (let i = num.length - 1; i >= 0; i--) {
    sum += Number(num[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  return sum % 11
}

/** General check digit of a bank barcode (position 5). */
export function bankBarcodeDv(barcodeWithoutDv: string) {
  const dv = 11 - weightedMod11(barcodeWithoutDv)
  return dv === 0 || dv >= 10 ? 1 : dv
}

function utilityMod11(num: string) {
  const dv = 11 - weightedMod11(num)
  return dv >= 10 ? 0 : dv
}

function toISO(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Picks between the old and the restarted factor base, whichever lands closer to the reference date. */
export function dueDateFromFactor(factor: number, referenceISO: string) {
  if (!factor) return null
  const reference = Date.parse(`${referenceISO}T00:00:00Z`)
  const oldDate = OLD_BASE + factor * DAY
  if (factor < 1000) return toISO(oldDate)
  const newDate = NEW_BASE + (factor - 1000) * DAY
  return Math.abs(newDate - reference) <= Math.abs(oldDate - reference) ? toISO(newDate) : toISO(oldDate)
}

function parseBankBarcode(barcode: string, digits: string, fieldsValid: boolean, referenceISO: string): ParsedBoleto {
  const dvOk = bankBarcodeDv(barcode.slice(0, 4) + barcode.slice(5)) === Number(barcode[4])
  const cents = Number(barcode.slice(9, 19))
  return {
    kind: 'bancario',
    digits,
    barcode,
    valid: fieldsValid && dvOk,
    amount: cents > 0 ? cents / 100 : null,
    dueDate: dueDateFromFactor(Number(barcode.slice(5, 9)), referenceISO),
    bankCode: barcode.slice(0, 3),
  }
}

function parseUtilityBarcode(barcode: string, digits: string, blocksValid: boolean): ParsedBoleto {
  const valueId = barcode[2]
  const useMod10 = valueId === '6' || valueId === '7'
  const dvBody = barcode.slice(0, 3) + barcode.slice(4)
  const dv = useMod10 ? mod10(dvBody) : utilityMod11(dvBody)
  const isRealValue = valueId === '6' || valueId === '8'
  const cents = Number(barcode.slice(4, 15))
  return {
    kind: 'arrecadacao',
    digits,
    barcode,
    valid: blocksValid && dv === Number(barcode[3]),
    amount: isRealValue && cents > 0 ? cents / 100 : null,
    dueDate: null,
    bankCode: null,
  }
}

export function parseBoleto(input: string, referenceISO: string): ParsedBoleto | null {
  const digits = onlyDigits(input)

  if (digits.length === 47) {
    const fields: [string, string][] = [
      [digits.slice(0, 9), digits[9]],
      [digits.slice(10, 20), digits[20]],
      [digits.slice(21, 31), digits[31]],
    ]
    const fieldsValid = fields.every(([body, dv]) => mod10(body) === Number(dv))
    const barcode =
      digits.slice(0, 4) + digits[32] + digits.slice(33, 47) + digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31)
    return parseBankBarcode(barcode, digits, fieldsValid, referenceISO)
  }

  if (digits.length === 48 && digits[0] === '8') {
    const useMod10 = digits[2] === '6' || digits[2] === '7'
    let barcode = ''
    let blocksValid = true
    for (let i = 0; i < 4; i++) {
      const body = digits.slice(i * 12, i * 12 + 11)
      const dv = Number(digits[i * 12 + 11])
      if ((useMod10 ? mod10(body) : utilityMod11(body)) !== dv) blocksValid = false
      barcode += body
    }
    return parseUtilityBarcode(barcode, digits, blocksValid)
  }

  if (digits.length === 44) {
    return digits[0] === '8'
      ? parseUtilityBarcode(digits, digits, true)
      : parseBankBarcode(digits, digits, true, referenceISO)
  }

  return null
}

export function formatDigitableLine(digits: string) {
  if (digits.length === 47) {
    return `${digits.slice(0, 5)}.${digits.slice(5, 10)} ${digits.slice(10, 15)}.${digits.slice(15, 21)} ${digits.slice(21, 26)}.${digits.slice(26, 32)} ${digits[32]} ${digits.slice(33)}`
  }
  if (digits.length === 48) {
    return [0, 1, 2, 3].map((i) => `${digits.slice(i * 12, i * 12 + 11)}-${digits[i * 12 + 11]}`).join(' ')
  }
  return digits
}

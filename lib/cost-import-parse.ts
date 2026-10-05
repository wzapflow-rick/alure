export type ParsedCostLine = {
  line: number
  sku: string
  unitCost: number
  quantity: number
  supplier: string | null
}

/** Same product appears as "2060.C83" and "KLS-2060.C83" depending on the channel. */
export function normalizeSku(sku: string) {
  return sku.trim().toUpperCase().replace(/^KLS-/, '').replace(/\s+/g, '')
}

export function parseMoneyBR(raw: string): number | null {
  let v = raw.replace(/R\$/gi, '').replace(/\s/g, '')
  if (!v) return null
  if (v.includes(',') && v.includes('.')) v = v.replace(/\./g, '').replace(',', '.')
  else if (v.includes(',')) v = v.replace(',', '.')
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function splitLine(line: string) {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  return line.split(',')
}

export function parseCostSheet(text: string) {
  const lines: ParsedCostLine[] = []
  const invalid: { line: number; raw: string; reason: string }[] = []

  text.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1
    if (!raw.trim()) return
    const cols = splitLine(raw).map((c) => c.trim().replace(/^"|"$/g, ''))
    const sku = cols[0] ?? ''
    const cost = parseMoneyBR(cols[1] ?? '')

    if (cost === null) {
      if (lineNo === 1) return
      invalid.push({ line: lineNo, raw: raw.slice(0, 120), reason: 'Custo inválido' })
      return
    }
    if (!sku) {
      invalid.push({ line: lineNo, raw: raw.slice(0, 120), reason: 'SKU vazio' })
      return
    }
    if (cost === 0) {
      invalid.push({ line: lineNo, raw: raw.slice(0, 120), reason: 'Custo zero' })
      return
    }
    const qty = Number.parseInt((cols[2] ?? '').replace(/\D/g, ''), 10)
    lines.push({
      line: lineNo,
      sku: sku.slice(0, 64),
      unitCost: Math.round(cost * 10000) / 10000,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      supplier: cols[3]?.slice(0, 200) || null,
    })
  })

  return { lines, invalid }
}

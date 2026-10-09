const SPIN = /\{([^{}]*\|[^{}]*)\}/

export const OPT_OUT_FOOTERS = [
  'Se não quiser mais receber, é só responder SAIR.',
  'Prefere não receber essas mensagens? Responda SAIR.',
  'Para não receber mais, responda SAIR.',
  'Caso não queira mais receber novidades, responda SAIR.',
]

export const PLACEHOLDERS = [
  { token: '{saudacao}', hint: 'Bom dia / Boa tarde / Boa noite' },
  { token: '{primeiro_nome}', hint: 'Primeiro nome do contato' },
  { token: '{nome}', hint: 'Nome completo' },
  { token: '{link}', hint: 'Link da campanha' },
  { token: '{empresa}', hint: 'Nome da sua empresa' },
  { token: '{Oi|Olá|Opa}', hint: 'Sorteia uma das opções' },
]

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

/** Resolves `{a|b|c}` (nested allowed, innermost first). Placeholders without `|` are left untouched. */
export function spin(text: string) {
  let out = text
  for (let guard = 0; guard < 200 && SPIN.test(out); guard++) {
    out = out.replace(SPIN, (_, group: string) => pick(group.split('|')))
  }
  return out
}

/** Number of distinct texts a template can produce (approximate for nested groups). */
export function countCombinations(text: string) {
  let total = 1
  for (const match of text.matchAll(/\{([^{}]*\|[^{}]*)\}/g)) total *= match[1].split('|').length
  return total
}

export function greetingFor(hour: number) {
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function titleCase(word: string) {
  return word ? word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR') : ''
}

export function varKey(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
}

export function renderMessage(
  template: string,
  ctx: {
    name: string | null
    hour: number
    link: string | null
    appendLink: boolean
    optOutFooter: boolean
    company?: string
    vars?: Record<string, string>
  },
) {
  const fullName = (ctx.name ?? '').trim().split(/\s+/).filter(Boolean).map(titleCase).join(' ')
  const firstName = fullName.split(' ')[0] ?? ''
  let text = spin(template)
    .replaceAll('{saudacao}', greetingFor(ctx.hour))
    .replaceAll('{primeiro_nome}', firstName)
    .replaceAll('{nome}', fullName)
    .replaceAll('{link}', ctx.link ?? '')
    .replaceAll('{empresa}', ctx.company ?? '')
  // Extra spreadsheet columns ({cidade}, {bairro}...). Unknown tokens become empty so no "{x}" reaches the contact.
  text = text.replace(/\{([a-z0-9_]{1,30})\}/g, (_, key: string) => ctx.vars?.[key] ?? '')

  text = text
    .replace(/[ \t]+([,!.?])/g, '$1')
    .replace(/,\s*([!.?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (ctx.appendLink && ctx.link && !template.includes('{link}')) text = `${text}\n\n${ctx.link}`
  if (ctx.optOutFooter) text = `${text}\n\n${pick(OPT_OUT_FOOTERS)}`
  return text
}

/** Brazilian numbers become 55 + DDD + number. International numbers need a leading +. */
export function normalizePhone(raw: string) {
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (trimmed.startsWith('+') && !digits.startsWith('55')) return digits.length >= 8 && digits.length <= 15 ? digits : null
  digits = digits.replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  if (!digits.startsWith('55') || (digits.length !== 12 && digits.length !== 13)) return null
  const ddd = Number(digits.slice(2, 4))
  if (ddd < 11 || ddd > 99) return null
  return digits
}

export type ParsedContact = { phone: string; name: string | null }

/** Accepts one contact per line: "Nome; telefone", "telefone, Nome", CSV, tabs or just the number. */
export type TableContact = ParsedContact & { vars: Record<string, string> }

/**
 * Spreadsheet with a header row (telefone;nome;cidade...). Extra columns become {variables}.
 * Without a recognizable header it falls back to the free-form parser.
 */
export function parseContactTable(raw: string): { contacts: TableContact[]; invalid: number; columns: string[] } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const header = lines[0] ?? ''
  const sep = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ','
  const cols = header.split(sep).map((c) => varKey(c))
  const phoneIdx = cols.findIndex((c) => /^(telefone|phone|whatsapp|whats|celular|numero|fone)/.test(c))
  if (phoneIdx < 0 || cols.length < 2) {
    const free = parseContactList(raw)
    return { contacts: free.contacts.map((c) => ({ ...c, vars: {} })), invalid: free.invalid, columns: [] }
  }
  const nameIdx = cols.findIndex((c) => /^(nome|name|contato|cliente)$/.test(c))
  const reserved = new Set(['saudacao', 'primeiro_nome', 'nome', 'link', 'empresa'])
  const extra = cols
    .map((key, i) => ({ key, i }))
    .filter(({ key, i }) => key && i !== phoneIdx && i !== nameIdx && !reserved.has(key))
    .slice(0, 15)
  const contacts = new Map<string, TableContact>()
  let invalid = 0
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
    const phone = normalizePhone(cells[phoneIdx] ?? '')
    if (!phone) {
      invalid++
      continue
    }
    const vars: Record<string, string> = {}
    for (const { key, i } of extra) if (cells[i]) vars[key] = cells[i].slice(0, 120)
    const name = nameIdx >= 0 ? cells[nameIdx]?.slice(0, 120) || null : null
    contacts.set(phone, { phone, name, vars })
  }
  return { contacts: [...contacts.values()], invalid, columns: extra.map((e) => e.key) }
}

export function parseContactList(raw: string) {
  const contacts = new Map<string, ParsedContact>()
  let invalid = 0
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.split(/[;\t|]|,(?=\s*\+?\d)|(?<=\d)\s*,/).map((p) => p.trim()).filter(Boolean)
    const phonePart = parts.find((p) => p.replace(/\D/g, '').length >= 10)
    if (!phonePart) {
      if (!/telefone|phone|whats|celular/i.test(line)) invalid++
      continue
    }
    const phone = normalizePhone(phonePart)
    if (!phone) {
      invalid++
      continue
    }
    const name = parts.filter((p) => p !== phonePart && !/^\+?[\d\s().-]+$/.test(p)).join(' ').trim().slice(0, 120) || null
    if (!contacts.has(phone) || (name && !contacts.get(phone)!.name)) contacts.set(phone, { phone, name })
  }
  return { contacts: [...contacts.values()], invalid }
}

export function formatPhone(phone: string) {
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    const ddd = phone.slice(2, 4)
    const rest = phone.slice(4)
    return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
  }
  return `+${phone}`
}

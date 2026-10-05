import type { CartLine, CatalogItem } from '@/lib/catalog/types'

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Shopper-facing groups resolved from each item's own category and name.
 * A group only shows up when at least one published item matches it.
 */
const GROUPS: { label: string; match: RegExp }[] = [
  { label: 'Duchas', match: /\bducha|chuveiro/ },
  { label: 'Torneiras', match: /torneira|misturador/ },
  { label: 'Acessórios', match: /acessorio|cabide|toalheiro|papeleira|saboneteira|porta[- ](toalha|papel|sabonete|shampoo)|gancho|prateleira/ },
  { label: 'Acabamentos', match: /acabamento/ },
  { label: 'Sensores', match: /sensor/ },
]

export function itemGroups(item: CatalogItem): string[] {
  const haystack = normalize([item.category, item.name].filter(Boolean).join(' '))
  return GROUPS.filter((g) => g.match.test(haystack)).map((g) => g.label)
}

export function availableGroups(items: CatalogItem[]): string[] {
  const present = new Set(items.flatMap(itemGroups))
  return GROUPS.map((g) => g.label).filter((label) => present.has(label))
}

export function itemBrand(item: CatalogItem): string | null {
  return /\bdeca\b/i.test(item.name) ? 'Deca' : null
}

export function discountPercent(item: CatalogItem): number | null {
  if (!item.compareAtPrice || item.compareAtPrice <= item.price) return null
  const pct = Math.round((1 - item.price / item.compareAtPrice) * 100)
  return pct > 0 ? pct : null
}

export function catalogWhatsAppNumber(): string | null {
  const digits = process.env.NEXT_PUBLIC_CATALOG_WHATSAPP?.replace(/\D/g, '') ?? ''
  return digits.length >= 12 && digits.length <= 13 ? digits : null
}

export function whatsAppLink(number: string, text: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export function customerOrderMessage(lines: Pick<CartLine, 'name' | 'qty'>[], code?: string | null) {
  return [
    'Olá! Tenho interesse nos seguintes produtos da ALURE:',
    '',
    ...lines.map((l) => `• ${l.name} — ${l.qty} un.`),
    '',
    'Gostaria de confirmar disponibilidade e valor do frete.',
    code ? `\nPedido ${code}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n')
}

export const HELP_MESSAGE = 'Olá! Preciso de ajuda para escolher produtos da ALURE.'

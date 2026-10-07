import type { CatalogItem } from '@/lib/catalog/types'

/**
 * Deterministic, presentation-only normalization for the public catalog.
 * Nothing here writes to the database: categories, brands and finishes are
 * derived from each item's own category, name and finish fields.
 */

export function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function skuKey(sku: string) {
  return sku.trim().toUpperCase().replace(/^KLS-/, '')
}

export type CategoryDef = { slug: string; label: string; match: RegExp }

/** Ordered by priority: an item lands in the first category whose rule matches. */
export const CATEGORIES: CategoryDef[] = [
  { slug: 'reposicao', label: 'Peças de reposição', match: /\b(reparo|refil|cartucho|mecanismo|vedante|vedacao|castanha|arejador|flexivel|engate|sifao|valvula de escoamento)/ },
  { slug: 'kits', label: 'Kits e conjuntos', match: /\b(kit|conjunto)\b/ },
  { slug: 'acabamentos', label: 'Acabamentos de registro', match: /\bacabamento/ },
  { slug: 'registros', label: 'Registros e válvulas', match: /\b(registro|valvula|base para|base de)/ },
  { slug: 'tecnologia', label: 'Sensores e tecnologia', match: /\b(sensor|decalux|eletronic|automatic|temporizad)/ },
  { slug: 'misturadores', label: 'Misturadores', match: /\b(misturador|monocomando)/ },
  { slug: 'torneiras', label: 'Torneiras', match: /\btorneira/ },
  { slug: 'duchas', label: 'Duchas e chuveiros', match: /\b(ducha|chuveir)/ },
  {
    slug: 'acessorios',
    label: 'Acessórios de banheiro',
    match: /\b(acessorio|cabide|toalheiro|papeleira|saboneteira|porta[- ]?(toalha|papel|sabonete|shampoo|escova)|gancho|prateleira|barra de apoio|dispenser)/,
  },
]

export const OTHER_CATEGORY = { slug: 'outros', label: 'Outros produtos' }

const BRANDS = ['Deca', 'Hydra', 'Docol', 'Fani', 'Lorenzetti', 'Celite', 'Roca', 'Tigre', 'Meber', 'Perflex', 'Blukit', 'Astra', 'Esteves']
const BRAND_PATTERNS = BRANDS.map((label) => ({ label, match: new RegExp(`\\b${normalizeText(label)}\\b`) }))

export type FinishDef = { slug: string; label: string; swatch: string; match: RegExp }

/** Finishes only come from the item's finish field or an explicit finish word in its name. */
export const FINISHES: FinishDef[] = [
  { slug: 'gold-matte', label: 'Gold Matte', swatch: '#b89b6a', match: /\b(gold\s*matte|ouro\s*fosco|dourado\s*fosco)\b/ },
  { slug: 'black-matte', label: 'Black Matte', swatch: '#22252a', match: /\b(black\s*matte|preto\s*fosco|black noir|preto)\b/ },
  { slug: 'cromado', label: 'Cromado', swatch: 'linear-gradient(135deg,#f4f5f7,#a9afb7 55%,#e8eaee)', match: /\b(cromad[oa]|chrome|cromo)\b/ },
  { slug: 'inox', label: 'Inox / Escovado', swatch: 'linear-gradient(135deg,#d9d6cf,#9c9a94)', match: /\b(inox|escovad[oa]|steel)\b/ },
  { slug: 'branco', label: 'Branco', swatch: '#ffffff', match: /\b(branc[oa]|white)\b/ },
  { slug: 'red-gold', label: 'Red Gold', swatch: '#b9826a', match: /\b(red\s*gold|rose\s*gold)\b/ },
]

export type EnrichedItem = CatalogItem & {
  key: string
  category: string | null
  categorySlug: string
  categoryLabel: string
  brand: string | null
  finishSlug: string | null
  finishLabel: string | null
  searchWords: string[]
  skuCompact: string
}

function stem(word: string) {
  if (/\d/.test(word)) return word
  return word.replace(/(oes|aes|es|s)$/, '').replace(/[aoe]$/, '')
}

function words(text: string) {
  return normalizeText(text)
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
}

export function enrichItem(item: CatalogItem): EnrichedItem {
  const base = normalizeText([item.category, item.name].filter(Boolean).join(' '))
  const category = CATEGORIES.find((c) => c.match.test(base))

  const brandHaystack = normalizeText(item.name)
  const brand = BRAND_PATTERNS.find((b) => b.match.test(brandHaystack))?.label ?? null

  const finishHaystack = normalizeText([item.finish, item.name].filter(Boolean).join(' '))
  const finish = FINISHES.find((f) => f.match.test(finishHaystack))
  const rawFinish = item.finish?.trim() || null

  const categoryLabel = category?.label ?? OTHER_CATEGORY.label
  const finishLabel = finish?.label ?? rawFinish

  return {
    ...item,
    key: skuKey(item.sku),
    categorySlug: category?.slug ?? OTHER_CATEGORY.slug,
    categoryLabel,
    brand,
    finishSlug: finish?.slug ?? (rawFinish ? `x-${normalizeText(rawFinish).replace(/\s+/g, '-')}` : null),
    finishLabel,
    searchWords: words([item.name, item.category, categoryLabel, brand, finishLabel].filter(Boolean).join(' ')).map(stem),
    skuCompact: normalizeText(item.sku).replace(/[^a-z0-9]/g, ''),
  }
}

/**
 * One card per SKU. Prefers the record that has photos, then more photos,
 * then the earliest in the editorial order. Source rows are left untouched.
 */
export function dedupeBySku(items: CatalogItem[]): CatalogItem[] {
  const chosen = new Map<string, { item: CatalogItem; index: number }>()
  items.forEach((item, index) => {
    const key = skuKey(item.sku)
    const current = chosen.get(key)
    if (!current) {
      chosen.set(key, { item, index })
      return
    }
    const better =
      item.images.length > 0 !== current.item.images.length > 0
        ? item.images.length > 0
        : item.images.length > current.item.images.length
    if (better) chosen.set(key, { item, index: current.index })
  })
  return [...chosen.values()].sort((a, b) => a.index - b.index).map((c) => c.item)
}

/** Relevance score for a free-text query; 0 means "no match". Every term must match. */
export function scoreItem(item: EnrichedItem, query: string): number {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1
  const queryCompact = normalizeText(query).replace(/[^a-z0-9]/g, '')
  let score = 0

  if (queryCompact.length >= 3 && /\d/.test(queryCompact)) {
    if (item.skuCompact === queryCompact) return 1000
    if (item.skuCompact.startsWith(queryCompact)) score += 400
    else if (item.skuCompact.includes(queryCompact)) score += 200
  }

  for (const term of terms) {
    const compact = term.replace(/[^a-z0-9]/g, '')
    const termStem = stem(term)
    let best = 0
    if (compact.length >= 2 && /\d/.test(compact) && item.skuCompact.includes(compact)) best = 50
    for (const word of item.searchWords) {
      if (word === termStem) best = Math.max(best, 30)
      else if (word.startsWith(termStem)) best = Math.max(best, 18)
      else if (termStem.length >= 4 && word.includes(termStem)) best = Math.max(best, 6)
    }
    if (best === 0) return score >= 200 ? score : 0
    score += best
  }
  return score
}

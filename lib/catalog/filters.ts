import { scoreItem, type EnrichedItem } from '@/lib/catalog/taxonomy'

export type SortKey = 'relevancia' | 'menor-preco' | 'maior-preco' | 'mais-vendidos' | 'recentes'

export const SORT_LABEL: Record<SortKey, string> = {
  relevancia: 'Mais relevantes',
  'menor-preco': 'Menor preço',
  'maior-preco': 'Maior preço',
  'mais-vendidos': 'Mais vendidos',
  recentes: 'Mais recentes',
}

export type CatalogFilters = {
  q: string
  categoria: string | null
  marcas: string[]
  acabamentos: string[]
  min: number | null
  max: number | null
  ordem: SortKey
}

const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : [])
const num = (value: string | null) => {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const ordem = params.get('ordem') as SortKey | null
  return {
    q: params.get('q') ?? '',
    categoria: params.get('categoria'),
    marcas: list(params.get('marca')),
    acabamentos: list(params.get('acabamento')),
    min: num(params.get('min')),
    max: num(params.get('max')),
    ordem: ordem && ordem in SORT_LABEL ? ordem : 'relevancia',
  }
}

/** Keeps unrelated params (utm_*, ref) so attribution survives filtering. */
export function writeFilters(current: URLSearchParams, filters: CatalogFilters) {
  const params = new URLSearchParams(current)
  const set = (key: string, value: string | null) => (value ? params.set(key, value) : params.delete(key))
  set('q', filters.q.trim() || null)
  set('categoria', filters.categoria)
  set('marca', filters.marcas.join(',') || null)
  set('acabamento', filters.acabamentos.join(',') || null)
  set('min', filters.min === null ? null : String(filters.min))
  set('max', filters.max === null ? null : String(filters.max))
  set('ordem', filters.ordem === 'relevancia' ? null : filters.ordem)
  return params
}

export function hasActiveFilters(f: CatalogFilters) {
  return Boolean(f.q.trim() || f.categoria || f.marcas.length || f.acabamentos.length || f.min !== null || f.max !== null)
}

type Facet = 'categoria' | 'marcas' | 'acabamentos' | 'preco' | 'busca'

/** Items passing every filter except `skip`, so each facet can count its own options. */
export function matchItems(items: EnrichedItem[], f: CatalogFilters, skip?: Facet) {
  const scores = new Map<number, number>()
  const result = items.filter((item) => {
    if (skip !== 'busca' && f.q.trim()) {
      const score = scoreItem(item, f.q)
      if (score === 0) return false
      scores.set(item.id, score)
    }
    if (skip !== 'categoria' && f.categoria && item.categorySlug !== f.categoria) return false
    if (skip !== 'marcas' && f.marcas.length && !f.marcas.includes(item.brand ?? 'sem-marca')) return false
    if (skip !== 'acabamentos' && f.acabamentos.length && !(item.finishSlug && f.acabamentos.includes(item.finishSlug)))
      return false
    if (skip !== 'preco') {
      if (f.min !== null && item.price < f.min) return false
      if (f.max !== null && item.price > f.max) return false
    }
    return true
  })
  return { result, scores }
}

export function sortItems(
  items: EnrichedItem[],
  ordem: SortKey,
  scores: Map<number, number>,
  salesRank: Map<number, number>,
) {
  const rank = (id: number) => salesRank.get(id) ?? Number.MAX_SAFE_INTEGER
  const sorted = [...items]
  switch (ordem) {
    case 'menor-preco':
      return sorted.sort((a, b) => a.price - b.price)
    case 'maior-preco':
      return sorted.sort((a, b) => b.price - a.price)
    case 'mais-vendidos':
      return sorted.sort((a, b) => rank(a.id) - rank(b.id))
    case 'recentes':
      return sorted.sort((a, b) => b.id - a.id)
    default:
      if (scores.size === 0) return sorted
      return sorted.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
  }
}

import type { CatalogItem } from '@/lib/catalog/types'

export type Audience = 'projeto' | 'revenda' | 'obra'
export type SectionKey = 'procurados' | 'design' | 'tecnologia'
export type Badge = 'oferta' | 'mais-vendido' | 'para-projeto'

export const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: 'projeto', label: 'Projeto', hint: 'Design, tecnologia e acabamentos' },
  { key: 'revenda', label: 'Revenda', hint: 'Giro e faixas de preço' },
  { key: 'obra', label: 'Obra', hint: 'Soluções técnicas e acessórios' },
]

export const BADGE_LABEL: Record<Badge, string> = {
  oferta: 'Oferta',
  'mais-vendido': 'Mais vendido',
  'para-projeto': 'Para projeto',
}

type CuratedEntry = { sku: string; section: SectionKey | null; audiences: Audience[] }

const giro = (sku: string, section: SectionKey | null = 'procurados'): CuratedEntry => ({
  sku,
  section,
  audiences: ['revenda', 'obra'],
})
const tech = (sku: string): CuratedEntry => ({ sku, section: 'tecnologia', audiences: ['projeto', 'obra'] })
const design = (sku: string): CuratedEntry => ({ sku, section: 'design', audiences: ['projeto'] })

/** ALURE's hand-picked storefront, in display order. SKUs not published with a photo are simply skipped. */
const CURATION: CuratedEntry[] = [
  giro('4906.303'),
  giro('4678.003'),
  giro('4607.C.040'),
  giro('4678.113'),
  giro('SP.132.01'),
  { sku: '2060.C83', section: 'procurados', audiences: ['projeto', 'revenda'] },
  { sku: '2020.C83', section: 'procurados', audiences: ['projeto', 'revenda'] },
  giro('4607.C.060', null),
  giro('4906.ACT.BR', null),
  giro('4124.012', null),

  design('2240.C'),
  design('1992.GL.TET.MT'),
  design('1877.C.DSC'),
  design('1878.GL87.MT'),
  design('1877.GL86.MT'),
  design('4900.GL87.PQ.MT'),
  design('1785.C'),
  design('4916.C87'),

  tech('4278.030'),
  tech('1173.C'),
  tech('1180.C'),
  tech('4266.021'),
  tech('2580.E.BR'),
  tech('1780.C'),
  tech('4278.027'),
]

const RESALE_MAX_TICKET = 800

export function normalizeSku(sku: string) {
  return sku.trim().toUpperCase().replace(/^KLS-/, '')
}

export type ShowcaseSection = {
  key: SectionKey | 'revenda' | 'ofertas'
  eyebrow: string
  title: string
  description: string
  ids: number[]
}

export type Showcase = {
  items: Record<number, CatalogItem>
  audiences: Record<number, Audience[]>
  badges: Record<number, Badge>
  sections: ShowcaseSection[]
  curatedCount: number
}

function findMatch(sku: string, items: CatalogItem[], taken: Set<number>) {
  const target = normalizeSku(sku)
  let best: CatalogItem | null = null
  let bestScore = Infinity
  for (const item of items) {
    if (taken.has(item.id)) continue
    const norm = normalizeSku(item.sku)
    const score = norm === target ? 0 : norm.startsWith(`${target}.`) ? norm.length : Infinity
    if (score < bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

/**
 * Builds the storefront from real published items only. Badges come from data:
 * "oferta" from a real compare-at price, "mais vendido" from marketplace sales,
 * "para projeto" from ALURE's design curation.
 */
export function buildShowcase(published: CatalogItem[], bestSellerIds: number[]): Showcase {
  const taken = new Set<number>()
  const seenSkus = new Set<string>()
  const picked: { item: CatalogItem; entry: CuratedEntry }[] = []

  for (const entry of CURATION) {
    const item = findMatch(entry.sku, published, taken)
    if (!item) continue
    const norm = normalizeSku(item.sku)
    if (seenSkus.has(norm)) continue
    taken.add(item.id)
    seenSkus.add(norm)
    picked.push({ item, entry })
  }

  const topSellers = new Set(bestSellerIds.slice(0, 6))
  const soldIds = new Set(bestSellerIds)
  const items: Record<number, CatalogItem> = {}
  const audiences: Record<number, Audience[]> = {}
  const badges: Record<number, Badge> = {}

  const offers = published.filter((i) => i.compareAtPrice !== null)
  for (const item of [...picked.map((p) => p.item), ...offers]) items[item.id] = item
  for (const { item, entry } of picked) audiences[item.id] = entry.audiences

  for (const item of Object.values(items)) {
    if (item.compareAtPrice !== null) badges[item.id] = 'oferta'
    else if (topSellers.has(item.id)) badges[item.id] = 'mais-vendido'
  }
  for (const { item, entry } of picked) {
    if (!badges[item.id] && entry.section === 'design') badges[item.id] = 'para-projeto'
  }

  const inSection = (key: SectionKey) => picked.filter((p) => p.entry.section === key).map((p) => p.item.id)
  const procurados = new Set(inSection('procurados'))

  const resale = picked
    .filter(
      ({ item, entry }) =>
        !procurados.has(item.id) &&
        item.price <= RESALE_MAX_TICKET &&
        (entry.audiences.includes('revenda') || soldIds.has(item.id)),
    )
    .sort((a, b) => a.item.price - b.item.price)
    .map((p) => p.item.id)

  const sections: ShowcaseSection[] = [
    {
      key: 'procurados',
      eyebrow: 'Giro comprovado',
      title: 'Mais procurados',
      description: 'Os itens que mais saem no dia a dia de obras e lojas.',
      ids: inSection('procurados'),
    },
    {
      key: 'ofertas',
      eyebrow: 'Preço especial',
      title: 'Ofertas ALURE',
      description: 'Condição de venda direta abaixo do preço de marketplace.',
      ids: offers.map((o) => o.id),
    },
    {
      key: 'design',
      eyebrow: 'Para especificar',
      title: 'Design & acabamentos',
      description: 'Linhas Gold Matte, Dream, Cubo e misturadores para projetos de arquitetura.',
      ids: inSection('design'),
    },
    {
      key: 'tecnologia',
      eyebrow: 'Uso público e comercial',
      title: 'Tecnologia & soluções',
      description: 'Sensores, torneiras automáticas e componentes Decalux.',
      ids: inSection('tecnologia'),
    },
    {
      key: 'revenda',
      eyebrow: 'Para lojas',
      title: 'Para revenda',
      description: 'Ticket menor e médio, com saída rápida no balcão.',
      ids: resale,
    },
  ]

  return {
    items,
    audiences,
    badges,
    sections: sections.filter((s) => s.ids.length > 0),
    curatedCount: picked.length,
  }
}

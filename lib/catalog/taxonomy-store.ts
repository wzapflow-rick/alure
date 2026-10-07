import 'server-only'
import { query } from '@/lib/db'
import { CATEGORIES, EMPTY_TAXONOMY_CONFIG, FINISHES, type TaxonomyConfig } from '@/lib/catalog/taxonomy'

export type TaxonomyKind = 'category' | 'finish'

export type TaxonomyEntry = {
  id: number
  kind: TaxonomyKind
  label: string
  defaultSlug: string | null
  hidden: boolean
  sortOrder: number
}

type Row = { id: string; kind: TaxonomyKind; label: string; default_slug: string | null; hidden: boolean; sort_order: number }

function isMissingTable(error: unknown) {
  return (error as { code?: string })?.code === '42P01'
}

/** Null when migration 017 hasn't been applied yet, so callers can fall back to built-in defaults. */
export async function listTaxonomyEntries(): Promise<TaxonomyEntry[] | null> {
  try {
    const rows = await query<Row>(
      `SELECT id, kind, label, default_slug, hidden, sort_order FROM catalog_taxonomy ORDER BY kind, sort_order, label`,
    )
    return rows.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      label: r.label,
      defaultSlug: r.default_slug,
      hidden: r.hidden,
      sortOrder: r.sort_order,
    }))
  } catch (error) {
    if (isMissingTable(error)) return null
    throw error
  }
}

export function toTaxonomyConfig(entries: TaxonomyEntry[] | null): TaxonomyConfig {
  if (!entries) return EMPTY_TAXONOMY_CONFIG
  const config: TaxonomyConfig = { categoryLabels: {}, hiddenCategories: [], finishLabels: {}, hiddenFinishes: [] }
  for (const e of entries) {
    if (!e.defaultSlug) continue
    const defs = e.kind === 'category' ? CATEGORIES : FINISHES
    const def = defs.find((d) => d.slug === e.defaultSlug)
    if (!def) continue
    if (e.hidden) (e.kind === 'category' ? config.hiddenCategories : config.hiddenFinishes).push(def.slug)
    else if (e.label !== def.label) (e.kind === 'category' ? config.categoryLabels : config.finishLabels)[def.slug] = e.label
  }
  return config
}

export async function getTaxonomyConfig(): Promise<TaxonomyConfig> {
  try {
    return toTaxonomyConfig(await listTaxonomyEntries())
  } catch (error) {
    console.error('[alure] taxonomy config load failed:', error)
    return EMPTY_TAXONOMY_CONFIG
  }
}

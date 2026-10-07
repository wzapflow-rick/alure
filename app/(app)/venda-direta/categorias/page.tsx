import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { TaxonomyPanel, type ManagedEntry } from '@/components/catalog-admin/taxonomy-manager'
import { listAdminItems } from '@/lib/catalog/queries'
import { CUSTOM_CATEGORY_PREFIX, CUSTOM_FINISH_PREFIX, enrichItem, normalizeText, slugify } from '@/lib/catalog/taxonomy'
import { listTaxonomyEntries, toTaxonomyConfig, type TaxonomyEntry, type TaxonomyKind } from '@/lib/catalog/taxonomy-store'

export const metadata: Metadata = { title: 'Categorias e acabamentos' }

function slugFor(entry: TaxonomyEntry) {
  if (entry.defaultSlug) return entry.defaultSlug
  return `${entry.kind === 'category' ? CUSTOM_CATEGORY_PREFIX : CUSTOM_FINISH_PREFIX}${slugify(entry.label)}`
}

export default async function TaxonomyPage() {
  const [entries, items] = await Promise.all([listTaxonomyEntries(), listAdminItems()])

  const header = (
    <>
      <Link href="/venda-direta" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Catálogo
      </Link>
      <PageHeader
        eyebrow="Venda direta"
        title="Categorias e acabamentos"
        description="Renomeie, exclua ou crie. Mudanças valem na hora para todos os itens e para o filtro do catálogo público."
      />
    </>
  )

  if (!entries) {
    return (
      <>
        {header}
        <Panel>
          <EmptyState
            title="Falta rodar a migração."
            description="Rode o script db/017_catalog_taxonomy.sql no pgAdmin para liberar a edição de categorias e acabamentos."
          />
        </Panel>
      </>
    )
  }

  const config = toTaxonomyConfig(entries)
  const enriched = items.map((item) => enrichItem(item, config))
  const counts = { category: new Map<string, number>(), finish: new Map<string, number>() }
  const explicit = { category: new Map<string, number>(), finish: new Map<string, number>() }
  for (const item of enriched) {
    counts.category.set(item.categorySlug, (counts.category.get(item.categorySlug) ?? 0) + 1)
    if (item.finishSlug) counts.finish.set(item.finishSlug, (counts.finish.get(item.finishSlug) ?? 0) + 1)
    if (item.category) explicit.category.set(normalizeText(item.category.trim()), (explicit.category.get(normalizeText(item.category.trim())) ?? 0) + 1)
    if (item.finish) explicit.finish.set(normalizeText(item.finish.trim()), (explicit.finish.get(normalizeText(item.finish.trim())) ?? 0) + 1)
  }

  const managed = (kind: TaxonomyKind): ManagedEntry[] =>
    entries
      .filter((e) => e.kind === kind)
      .map((e) => ({
        id: e.id,
        label: e.label,
        isDefault: Boolean(e.defaultSlug),
        hidden: e.hidden,
        count: e.hidden ? (explicit[kind].get(normalizeText(e.label)) ?? 0) : (counts[kind].get(slugFor(e)) ?? 0),
      }))

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <TaxonomyPanel kind="category" entries={managed('category')} />
        <TaxonomyPanel kind="finish" entries={managed('finish')} />
      </div>
    </>
  )
}

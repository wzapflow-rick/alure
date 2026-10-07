'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { CategoryStrip, type CategoryCard } from '@/components/catalog/category-strip'
import { FilterPanel, type FacetOption } from '@/components/catalog/filter-panel'
import { ProductTile } from '@/components/catalog/product-tile'
import { useCatalogFilters } from '@/components/catalog/use-catalog-filters'
import { trackCatalog } from '@/lib/catalog/analytics'
import { hasActiveFilters, matchItems, SORT_LABEL, sortItems, type SortKey } from '@/lib/catalog/filters'
import { CATEGORIES, enrichItem, FINISHES, OTHER_CATEGORY, type EnrichedItem } from '@/lib/catalog/taxonomy'
import type { CatalogItem } from '@/lib/catalog/types'
import { formatBRL } from '@/lib/format'

const PAGE_SIZE = 30
const BEST_SELLER_BADGES = 8
const NO_BRAND = 'sem-marca'

function countBy(items: EnrichedItem[], key: (i: EnrichedItem) => string | null) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

export function CatalogBrowser({ items: rawItems, bestSellerIds }: { items: CatalogItem[]; bestSellerIds: number[] }) {
  const items = useMemo(() => rawItems.map(enrichItem), [rawItems])
  const salesRank = useMemo(() => new Map(bestSellerIds.map((id, i) => [id, i])), [bestSellerIds])
  const badgeIds = useMemo(() => new Set(bestSellerIds.slice(0, BEST_SELLER_BADGES)), [bestSellerIds])
  const { filters, update, reset } = useCatalogFilters()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const resultsRef = useRef<HTMLDivElement>(null)
  const filtersDialog = useRef<HTMLDialogElement>(null)

  const { result, scores } = useMemo(() => matchItems(items, filters), [items, filters])
  const sorted = useMemo(() => sortItems(result, filters.ordem, scores, salesRank), [result, filters.ordem, scores, salesRank])

  useEffect(() => setVisible(PAGE_SIZE), [filters])

  const categoryCards = useMemo<CategoryCard[]>(() => {
    const defs = [...CATEGORIES, OTHER_CATEGORY]
    return defs
      .map((def) => {
        const inCat = items.filter((i) => i.categorySlug === def.slug)
        const pick =
          [...inCat].filter((i) => i.images[0]).sort((a, b) => (salesRank.get(a.id) ?? 1e9) - (salesRank.get(b.id) ?? 1e9))[0] ??
          null
        const soldWeight = inCat.reduce((sum, i) => {
          const rank = salesRank.get(i.id)
          return rank === undefined ? sum : sum + 1 / (rank + 1)
        }, 0)
        return { slug: def.slug, label: def.label, count: inCat.length, image: pick?.images[0] ?? null, soldWeight }
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => {
        if (a.slug === OTHER_CATEGORY.slug) return 1
        if (b.slug === OTHER_CATEGORY.slug) return -1
        return b.soldWeight - a.soldWeight || b.count - a.count
      })
      .map(({ soldWeight: _weight, ...card }) => card)
  }, [items, salesRank])

  const mostWanted = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]))
    return bestSellerIds.map((id) => byId.get(id)).filter((i): i is EnrichedItem => Boolean(i)).slice(0, BEST_SELLER_BADGES)
  }, [items, bestSellerIds])

  const facets = useMemo(() => {
    const forCategory = countBy(matchItems(items, filters, 'categoria').result, (i) => i.categorySlug)
    const forBrand = countBy(matchItems(items, filters, 'marcas').result, (i) => i.brand ?? NO_BRAND)
    const forFinish = countBy(matchItems(items, filters, 'acabamentos').result, (i) => i.finishSlug)

    const categories: FacetOption[] = categoryCards.map((c) => ({
      value: c.slug,
      label: c.label,
      count: forCategory.get(c.slug) ?? 0,
    }))

    const brandNames = [...new Set(items.map((i) => i.brand ?? NO_BRAND))].sort((a, b) =>
      a === NO_BRAND ? 1 : b === NO_BRAND ? -1 : a.localeCompare(b, 'pt-BR'),
    )
    const brands: FacetOption[] = brandNames.map((b) => ({
      value: b,
      label: b === NO_BRAND ? 'Marca não informada' : b,
      count: forBrand.get(b) ?? 0,
    }))

    const finishLabels = new Map<string, string>()
    for (const i of items) if (i.finishSlug && i.finishLabel) finishLabels.set(i.finishSlug, i.finishLabel)
    const finishes: FacetOption[] = [...finishLabels.entries()]
      .map(([value, label]) => ({
        value,
        label,
        count: forFinish.get(value) ?? 0,
        swatch: FINISHES.find((f) => f.slug === value)?.swatch,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))

    const allPrices = items.map((i) => i.price)
    const priceBounds = allPrices.length
      ? { min: Math.min(...allPrices), max: Math.max(...allPrices) }
      : null

    return { categories, brands, finishes, priceBounds }
  }, [items, filters, categoryCards])

  function scrollToResults() {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function selectCategory(slug: string | null, from: string) {
    update({ categoria: slug })
    if (slug) trackCatalog('category_selected', { category: slug, from })
  }

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  const panelProps = {
    categories: facets.categories,
    brands: facets.brands,
    finishes: facets.finishes,
    priceBounds: facets.priceBounds,
    categoria: filters.categoria,
    marcas: filters.marcas,
    acabamentos: filters.acabamentos,
    min: filters.min,
    max: filters.max,
    onCategory: (slug: string | null) => selectCategory(slug, 'sidebar'),
    onToggleBrand: (v: string) => {
      update({ marcas: toggle(filters.marcas, v) })
      trackCatalog('filter_applied', { facet: 'marca', value: v })
    },
    onToggleFinish: (v: string) => {
      update({ acabamentos: toggle(filters.acabamentos, v) })
      trackCatalog('filter_applied', { facet: 'acabamento', value: v })
    },
    onPrice: (min: number | null, max: number | null) => {
      update({ min, max })
      trackCatalog('filter_applied', { facet: 'preco' })
    },
  }

  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.q.trim()) chips.push({ key: 'q', label: `“${filters.q.trim()}”`, clear: () => update({ q: '' }) })
  if (filters.categoria) {
    const label = facets.categories.find((c) => c.value === filters.categoria)?.label ?? filters.categoria
    chips.push({ key: 'cat', label, clear: () => update({ categoria: null }) })
  }
  for (const m of filters.marcas)
    chips.push({
      key: `m-${m}`,
      label: m === NO_BRAND ? 'Marca não informada' : m,
      clear: () => update({ marcas: filters.marcas.filter((v) => v !== m) }),
    })
  for (const a of filters.acabamentos)
    chips.push({
      key: `a-${a}`,
      label: facets.finishes.find((f) => f.value === a)?.label ?? a,
      clear: () => update({ acabamentos: filters.acabamentos.filter((v) => v !== a) }),
    })
  if (filters.min !== null || filters.max !== null)
    chips.push({
      key: 'preco',
      label: `${filters.min !== null ? formatBRL(filters.min) : 'Até'}${filters.min !== null && filters.max !== null ? ' – ' : ' '}${filters.max !== null ? formatBRL(filters.max) : 'ou mais'}`,
      clear: () => update({ min: null, max: null }),
    })

  const active = hasActiveFilters(filters)
  const sortOptions = (Object.keys(SORT_LABEL) as SortKey[]).filter((k) => k !== 'mais-vendidos' || bestSellerIds.length > 0)
  const activeFilterCount = chips.filter((c) => c.key !== 'q').length

  return (
    <>
      <CategoryStrip
        categories={categoryCards}
        total={items.length}
        active={filters.categoria}
        onSelect={(slug) => {
          selectCategory(slug, 'cards')
          scrollToResults()
        }}
      />

      <section
        id="selecao"
        ref={resultsRef}
        aria-labelledby="produtos-title"
        className="mx-auto max-w-[1440px] scroll-mt-32 px-5 pt-12 md:px-8 md:pt-16 lg:scroll-mt-24"
      >
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
          <aside aria-label="Filtros" className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-6 pr-2 [scrollbar-width:thin]">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Filtros</h2>
                {active ? (
                  <button type="button" onClick={reset} className="text-xs text-info underline-offset-4 hover:underline">
                    Limpar tudo
                  </button>
                ) : null}
              </div>
              <FilterPanel {...panelProps} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {!active && mostWanted.length >= 4 ? (
              <section aria-labelledby="mais-procurados-title" className="mb-12">
                <div className="flex flex-col gap-1 border-b border-border pb-4">
                  <h2 id="mais-procurados-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
                    Mais procurados
                  </h2>
                  <p className="text-sm text-muted-foreground">Os produtos mais vendidos nos últimos 90 dias.</p>
                </div>
                <ul className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pt-6 [scrollbar-width:none] sm:gap-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden">
                  {mostWanted.map((item) => (
                    <li key={item.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] md:w-auto">
                      <ProductTile item={item} bestSeller />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-col gap-1">
                <h2 id="produtos-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {filters.categoria
                    ? (facets.categories.find((c) => c.value === filters.categoria)?.label ?? 'Produtos')
                    : filters.q.trim()
                      ? 'Resultados da busca'
                      : 'Todos os produtos'}
                </h2>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  <span className="tabular font-medium text-foreground">{sorted.length}</span>{' '}
                  {sorted.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => filtersDialog.current?.showModal()}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-foreground/25 md:flex-none lg:hidden"
                >
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Filtros
                  {activeFilterCount > 0 ? (
                    <span className="tabular inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>
                <label className="relative flex-1 md:flex-none">
                  <span className="sr-only">Ordenar por</span>
                  <select
                    value={filters.ordem}
                    onChange={(e) => update({ ordem: e.target.value as SortKey })}
                    className="h-10 w-full appearance-none rounded-full border border-border bg-surface pl-4 pr-10 text-sm font-medium text-foreground transition-colors hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-info/60 md:w-52"
                  >
                    {sortOptions.map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                </label>
              </div>
            </div>

            {chips.length > 0 ? (
              <ul className="flex flex-wrap items-center gap-2 pt-4" aria-label="Filtros ativos">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <button
                      type="button"
                      onClick={chip.clear}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-2 text-xs font-medium text-foreground transition-colors hover:bg-border"
                      aria-label={`Remover filtro ${chip.label}`}
                    >
                      {chip.label}
                      <X className="size-3.5 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={reset} className="px-2 text-xs text-info underline-offset-4 hover:underline">
                    Limpar filtros
                  </button>
                </li>
              </ul>
            ) : null}

            {sorted.length > 0 ? (
              <>
                <ul className="grid grid-cols-2 gap-3 pt-6 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {sorted.slice(0, visible).map((item, index) => (
                    <li key={item.id}>
                      <ProductTile item={item} bestSeller={badgeIds.has(item.id)} priority={index < 4} />
                    </li>
                  ))}
                </ul>
                {visible < sorted.length ? (
                  <div className="flex flex-col items-center gap-3 pt-10">
                    <p className="text-xs text-muted-foreground">
                      {`Mostrando ${Math.min(visible, sorted.length)} de ${sorted.length}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setVisible((v) => v + PAGE_SIZE)}
                      className="inline-flex h-11 items-center rounded-full border border-foreground/20 px-7 text-sm font-medium transition-colors hover:border-foreground hover:bg-surface"
                    >
                      Mostrar mais produtos
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
                <SearchX className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Nenhum produto encontrado</p>
                  <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                    Tente outro termo, um código de SKU ou remova alguns filtros.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Ver todos os produtos
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <dialog
        ref={filtersDialog}
        aria-label="Filtros"
        onClick={(e) => {
          if (e.target === e.currentTarget) filtersDialog.current?.close()
        }}
        className="catalog-theme fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-full max-w-sm bg-background p-0 text-foreground backdrop:bg-[#0d1821]/45 backdrop:backdrop-blur-sm"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Filtros</h2>
            <button
              type="button"
              onClick={() => filtersDialog.current?.close()}
              className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
              aria-label="Fechar filtros"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <FilterPanel {...panelProps} />
          </div>
          <footer className="flex gap-3 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={reset}
              disabled={!active}
              className="h-11 flex-1 rounded-full border border-border text-sm font-medium disabled:opacity-40"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                filtersDialog.current?.close()
                scrollToResults()
              }}
              className="h-11 flex-[1.4] rounded-full bg-primary text-sm font-medium text-primary-foreground"
            >
              {`Ver ${sorted.length} ${sorted.length === 1 ? 'produto' : 'produtos'}`}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  )
}

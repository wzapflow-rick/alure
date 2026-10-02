'use client'

import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SearchableProduct = { id: string; sku: string; name: string }

export function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function matchesProduct(p: SearchableProduct, term: string) {
  const t = normalize(term)
  if (!t) return true
  return normalize(p.sku).includes(t) || normalize(p.name).includes(t)
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar por SKU ou nome',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-9 font-mono text-sm placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Limpar busca"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

type QuickProduct = SearchableProduct & { average_cost: string | null }

const MAX_RESULTS = 8

/** Command-center shortcut: find a product by SKU and jump straight to its cost form. */
export function ProductQuickSearch({ products }: { products: QuickProduct[] }) {
  const [term, setTerm] = useState('')
  const deferred = useDeferredValue(term)
  const results = deferred.trim() ? products.filter((p) => matchesProduct(p, deferred)) : []
  const missingCost = products.filter((p) => !p.average_cost).length

  return (
    <section aria-label="Buscar produto" className="relative flex w-full flex-col gap-1.5">
      <SearchInput value={term} onChange={setTerm} placeholder="Buscar SKU, ex.: 4906.303" className="w-full" />
      {missingCost ? (
        <Link href="/produtos?status=no_cost" className="text-xs text-muted-foreground transition-colors hover:text-attention md:text-right">
          {missingCost} de {products.length} produtos sem custo
        </Link>
      ) : null}

      {deferred.trim() ? (
        results.length ? (
          <ul className="absolute inset-x-0 top-10 z-30 animate-fade divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-2xl shadow-background/80">
            {results.slice(0, MAX_RESULTS).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/produtos/${p.id}#custo`}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-surface-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                    <span className="truncate text-sm">{p.name}</span>
                  </span>
                  <span className={cn('shrink-0 text-xs', p.average_cost ? 'text-muted-foreground' : 'text-attention')}>
                    {p.average_cost
                      ? `Custo ${Number(p.average_cost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                      : 'Cadastrar custo'}
                  </span>
                </Link>
              </li>
            ))}
            {results.length > MAX_RESULTS ? (
              <li className="px-4 py-2 text-xs text-muted-foreground">
                Mais {results.length - MAX_RESULTS} resultados. Refine o SKU ou veja em{' '}
                <Link href={`/produtos?q=${encodeURIComponent(deferred)}`} className="underline hover:text-foreground">
                  Produtos
                </Link>
                .
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="absolute inset-x-0 top-10 z-30 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
            Nenhum produto com esse SKU ou nome.
          </p>
        )
      ) : null}
    </section>
  )
}

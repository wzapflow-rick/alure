'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useCatalogFilters } from '@/components/catalog/use-catalog-filters'
import { trackCatalog } from '@/lib/catalog/analytics'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 220

export function CatalogSearch({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const onCatalog = pathname === '/catalogo'
  const { filters, update } = useCatalogFilters()
  const [value, setValue] = useState(filters.q)
  const lastSent = useRef(filters.q)

  useEffect(() => {
    if (filters.q !== lastSent.current) {
      lastSent.current = filters.q
      setValue(filters.q)
    }
  }, [filters.q])

  useEffect(() => {
    if (!onCatalog || value === lastSent.current) return
    const timer = window.setTimeout(() => {
      lastSent.current = value
      update({ q: value })
      if (value.trim().length >= 2) trackCatalog('catalog_search', { q: value.trim().slice(0, 60) })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [value, onCatalog, update])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    if (onCatalog) {
      lastSent.current = value
      update({ q: value })
      document.getElementById('selecao')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      router.push(q ? `/catalogo?q=${encodeURIComponent(q)}#selecao` : '/catalogo#selecao')
    }
  }

  function clear() {
    setValue('')
    if (onCatalog) {
      lastSent.current = ''
      update({ q: '' })
    }
  }

  return (
    <form role="search" onSubmit={submit} className={cn('relative w-full', className)}>
      <label htmlFor="catalog-search" className="sr-only">
        Buscar produtos, modelos ou códigos
      </label>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        id="catalog-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            clear()
          }
        }}
        placeholder="Buscar produtos, modelos ou códigos..."
        className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-11 text-sm text-foreground placeholder:text-muted-foreground/80 transition-colors focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-info/25 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
          aria-label="Limpar busca"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </form>
  )
}

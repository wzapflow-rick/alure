'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseFilters, writeFilters, type CatalogFilters } from '@/lib/catalog/filters'

/**
 * Filters live in the URL so results are shareable and crawlable.
 * Updates use the native History API, which Next.js syncs with useSearchParams
 * without refetching the server page.
 */
export function useCatalogFilters() {
  const searchParams = useSearchParams()
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams])

  const update = useCallback((patch: Partial<CatalogFilters>) => {
    const current = new URLSearchParams(window.location.search)
    const next = writeFilters(current, { ...parseFilters(current), ...patch })
    const qs = next.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
  }, [])

  const reset = useCallback(() => {
    update({ q: '', categoria: null, marcas: [], acabamentos: [], min: null, max: null })
  }, [update])

  return { filters, update, reset }
}

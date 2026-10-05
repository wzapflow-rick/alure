'use client'

import { useEffect } from 'react'
import { trackCatalog, type CatalogEvent } from '@/lib/catalog/analytics'

/** Fires a single analytics event when mounted (page opens, product views). */
export function TrackEvent({ event, props }: { event: CatalogEvent; props?: Record<string, string | number | null> }) {
  const key = JSON.stringify(props ?? {})
  useEffect(() => {
    trackCatalog(event, JSON.parse(key))
  }, [event, key])
  return null
}

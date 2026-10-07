import { track } from '@vercel/analytics'

export type CatalogEvent =
  | 'catalog_open'
  | 'product_view'
  | 'audience_selected'
  | 'category_selected'
  | 'catalog_search'
  | 'filter_applied'
  | 'product_click'
  | 'add_to_cart'
  | 'cart_open'
  | 'whatsapp_checkout'
  | 'whatsapp_order_sent'
  | 'contact_click'

type Props = Record<string, string | number | null>

const SOURCE_KEY = 'alure-catalog-source'

/** First-touch origin for the session: utm_source, then ?ref, then the referrer host. */
export function resolveSource(): string {
  if (typeof window === 'undefined') return 'direto'
  try {
    const stored = window.sessionStorage.getItem(SOURCE_KEY)
    if (stored) return stored
    const params = new URLSearchParams(window.location.search)
    let source = params.get('utm_source') ?? params.get('ref')
    if (!source && document.referrer) {
      const host = new URL(document.referrer).hostname
      if (host && host !== window.location.hostname) source = host
    }
    const value = (source ?? 'direto').slice(0, 60)
    window.sessionStorage.setItem(SOURCE_KEY, value)
    return value
  } catch {
    return 'direto'
  }
}

export function trackCatalog(event: CatalogEvent, props: Props = {}) {
  try {
    track(event, { ...props, source: resolveSource() })
  } catch {
    // Analytics must never break the storefront.
  }
}

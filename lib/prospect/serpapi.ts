import 'server-only'

export type MapsPlace = {
  placeId: string
  name: string
  category: string | null
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  reviews: number | null
}

type RawPlace = {
  place_id?: string
  data_id?: string
  title?: string
  type?: string
  address?: string
  phone?: string
  website?: string
  rating?: number
  reviews?: number
}

type SerpResponse = {
  error?: string
  local_results?: RawPlace[]
  place_results?: RawPlace
  serpapi_pagination?: { next?: string }
}

export const MAX_PAGES = 6

export function serpApiKey() {
  return (process.env.SERPAPI_API_KEY ?? process.env.SERPAPI_KEY ?? process.env.SERP_API_KEY)?.trim() || null
}

function toPlace(r: RawPlace): MapsPlace | null {
  const placeId = r.place_id ?? r.data_id
  if (!placeId || !r.title) return null
  return {
    placeId,
    name: r.title.slice(0, 200),
    category: r.type?.slice(0, 120) ?? null,
    address: r.address?.slice(0, 300) ?? null,
    phone: r.phone?.slice(0, 40) ?? null,
    website: r.website?.slice(0, 500) ?? null,
    rating: typeof r.rating === 'number' ? r.rating : null,
    reviews: typeof r.reviews === 'number' ? r.reviews : null,
  }
}

/** Each page costs one SerpAPI search and returns up to 20 places. */
export async function searchGoogleMaps(query: string, pages: number): Promise<MapsPlace[]> {
  const key = serpApiKey()
  if (!key) throw new Error('SERPAPI_API_KEY não configurada.')

  let url: URL | null = new URL('https://serpapi.com/search.json')
  url.search = new URLSearchParams({
    engine: 'google_maps',
    type: 'search',
    q: query,
    hl: 'pt-br',
    gl: 'br',
    google_domain: 'google.com.br',
  }).toString()

  const places = new Map<string, MapsPlace>()
  for (let page = 0; page < Math.min(pages, MAX_PAGES) && url; page++) {
    url.searchParams.set('api_key', key)
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) })
    const json = (await res.json().catch(() => ({}))) as SerpResponse
    if (json.error) {
      if (/hasn't returned any results/i.test(json.error)) break
      throw new Error(`SerpAPI: ${json.error.slice(0, 200)}`)
    }
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`)

    const batch = json.local_results ?? (json.place_results ? [json.place_results] : [])
    for (const raw of batch) {
      const place = toPlace(raw)
      if (place) places.set(place.placeId, place)
    }
    url = json.serpapi_pagination?.next ? new URL(json.serpapi_pagination.next) : null
  }
  return [...places.values()]
}

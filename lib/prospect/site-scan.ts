import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { normalizePhone } from '@/lib/broadcast/text'

const MAX_BYTES = 600_000
const MAX_REDIRECTS = 3

const WA_LINK =
  /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'\s<>]*?&(?:amp;)?)?phone=|web\.whatsapp\.com\/send\/?\?(?:[^"'\s<>]*?&(?:amp;)?)?phone=|whatsapp:\/\/send\/?\?(?:[^"'\s<>]*?&(?:amp;)?)?phone=)(?:%2B|\+)?([\d\s().%-]{10,24})/gi

function isPrivateAddress(ip: string) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase()
    if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7))
    return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  )
}

/** Blocks requests to the server's own network: the URLs come from third-party listings. */
async function assertPublicUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('host')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error('host')
}

async function readCapped(res: Response) {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let html = ''
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    html += decoder.decode(value, { stream: true })
  }
  reader.cancel().catch(() => {})
  return html
}

export function extractWhatsApp(html: string) {
  const counts = new Map<string, number>()
  for (const match of html.matchAll(WA_LINK)) {
    const digits = decodeURIComponent(match[1].replace(/%(?![0-9a-f]{2})/gi, '')).replace(/\D/g, '')
    const phone = normalizePhone(digits)
    if (phone) counts.set(phone, (counts.get(phone) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Returns the WhatsApp number linked on the site's home page, or null. Never throws. */
export async function findWhatsAppOnSite(rawUrl: string): Promise<string | null> {
  try {
    let url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url)
      const res = await fetch(url, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(7_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlureBot/1.0)', Accept: 'text/html' },
      })
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location')
        if (!next) return null
        url = new URL(next, url)
        continue
      }
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
      return extractWhatsApp(await readCapped(res))
    }
    return null
  } catch {
    return null
  }
}

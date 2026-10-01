import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { logAudit } from '@/lib/audit'
import { saveConnection } from '@/lib/integrations/connections'
import { exchangeCode, fetchShopInfo } from '@/lib/integrations/shopee'
import { getSessionUser } from '@/lib/session'

const OAUTH_COOKIE = 'alure_shopee_oauth'

function sameString(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(request: NextRequest) {
  const back = new URL('/configuracoes', request.url)
  const done = (status: string) => {
    back.searchParams.set('shopee', status)
    const res = NextResponse.redirect(back)
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/integrations/shopee' })
    return res
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(new URL('/entrar', request.url))

  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const shopId = params.get('shop_id')
  const state = params.get('state')
  const saved = request.cookies.get(OAUTH_COOKIE)?.value
  if (!code || !shopId) return done('denied')
  if (!state || !saved || !sameString(state, saved)) return done('invalid_state')

  try {
    const tokens = await exchangeCode(code, shopId)
    const info = await fetchShopInfo(tokens.accessToken, shopId).catch(() => null)
    const connectionId = await saveConnection(
      'shopee',
      { externalAccountId: shopId, accountName: info?.shop_name ?? null },
      tokens,
      user.id,
    )
    await logAudit({
      user,
      action: 'integration.connected',
      entityType: 'marketplace_connection',
      entityId: connectionId,
      newValue: { marketplace: 'shopee', shopId, shop: info?.shop_name ?? null },
    })
    return done('connected')
  } catch (error) {
    console.error('[alure] Shopee OAuth callback failed:', (error as Error).message)
    return done('error')
  }
}

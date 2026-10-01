import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { buildAuthorizationUrl, shopeeConfig } from '@/lib/integrations/shopee'
import { getSessionUser } from '@/lib/session'

const OAUTH_COOKIE = 'alure_shopee_oauth'

export async function GET(request: NextRequest) {
  const back = new URL('/configuracoes', request.url)
  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(new URL('/entrar', request.url))
  if (!shopeeConfig()) {
    back.searchParams.set('shopee', 'missing_env')
    return NextResponse.redirect(back)
  }

  const state = randomBytes(24).toString('base64url')
  const response = NextResponse.redirect(buildAuthorizationUrl(state))
  response.cookies.set(OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/integrations/shopee',
    maxAge: 600,
  })
  return response
}

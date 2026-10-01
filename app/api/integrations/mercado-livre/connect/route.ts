import { NextResponse, type NextRequest } from 'next/server'
import { buildAuthorizationUrl, createOAuthState, meliConfig } from '@/lib/integrations/mercado-livre'
import { getSessionUser } from '@/lib/session'

export const OAUTH_COOKIE = 'alure_meli_oauth'

export async function GET(request: NextRequest) {
  const back = new URL('/configuracoes', request.url)
  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(new URL('/entrar', request.url))
  if (!meliConfig()) {
    back.searchParams.set('ml', 'missing_env')
    return NextResponse.redirect(back)
  }

  const { state, verifier, challenge } = createOAuthState()
  const response = NextResponse.redirect(buildAuthorizationUrl(state, challenge))
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/integrations/mercado-livre',
    maxAge: 600,
  })
  return response
}

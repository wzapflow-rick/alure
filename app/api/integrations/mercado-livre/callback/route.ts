import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { logAudit } from '@/lib/audit'
import { saveConnection } from '@/lib/integrations/connections'
import { exchangeCode, fetchMe } from '@/lib/integrations/mercado-livre'
import { getSessionUser } from '@/lib/session'

const OAUTH_COOKIE = 'alure_meli_oauth'

function sameString(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(request: NextRequest) {
  const back = new URL('/configuracoes', request.url)
  const done = (status: string) => {
    back.searchParams.set('ml', status)
    const res = NextResponse.redirect(back)
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/integrations/mercado-livre' })
    return res
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(new URL('/entrar', request.url))

  const params = request.nextUrl.searchParams
  if (params.get('error')) return done('denied')

  const code = params.get('code')
  const state = params.get('state')
  let saved: { state: string; verifier: string } | null = null
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? 'null')
  } catch {
    saved = null
  }
  if (!code || !state || !saved || !sameString(state, saved.state)) return done('invalid_state')

  try {
    const tokens = await exchangeCode(code, saved.verifier)
    const me = await fetchMe(tokens.accessToken)
    const connectionId = await saveConnection(
      'mercado_livre',
      { externalAccountId: String(me.id ?? tokens.userId), accountName: me.nickname ?? null },
      tokens,
      user.id,
    )
    await logAudit({
      user,
      action: 'integration.connected',
      entityType: 'marketplace_connection',
      entityId: connectionId,
      newValue: { marketplace: 'mercado_livre', account: me.nickname, scopes: tokens.scopes },
    })
    return done('connected')
  } catch (error) {
    const message = (error as Error).message
    console.error('[alure] Mercado Livre OAuth callback failed:', message)
    return done(message.includes('TOKEN_ENCRYPTION_KEY') ? 'missing_key' : 'error')
  }
}

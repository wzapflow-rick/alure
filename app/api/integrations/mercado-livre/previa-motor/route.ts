import { NextResponse, type NextRequest } from 'next/server'
import { previewEngine } from '@/lib/integrations/meli-competition'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const DEFAULT_SKUS = ['4906.303', '4607.C.040']

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const param = request.nextUrl.searchParams.get('sku')
  const skus = (param ? param.split(',') : DEFAULT_SKUS).map((s) => s.trim()).filter(Boolean).slice(0, 10)

  try {
    return NextResponse.json(await previewEngine(skus), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ erro: (error as Error).message }, { status: 502 })
  }
}

import { after, NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runBroadcastTick } from '@/lib/broadcast/engine'

export const maxDuration = 90

/**
 * Called every minute by an external scheduler (cron-job.org). Each call sends at most a few
 * messages, always respecting the intervals saved in the database. Pass `&wait=1` to run inline.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (request.nextUrl.searchParams.get('wait') === '1') {
    return NextResponse.json(await runBroadcastTick())
  }

  after(async () => {
    try {
      const result = await runBroadcastTick()
      if (result.sent || result.failed || result.skipped) console.log('[disparos] tick', JSON.stringify(result))
    } catch (err) {
      console.error('[disparos] tick failed', (err as Error).message)
    }
  })

  return NextResponse.json({ accepted: true }, { status: 202 })
}

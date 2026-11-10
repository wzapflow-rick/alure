import { after, NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runAnalysis } from '@/lib/analysis'
import { dispatchNotifications } from '@/lib/notify/dispatch'
import { refreshTodayIfStale } from '@/lib/sync/freshen'

export const maxDuration = 300

/** A full marketplace sync + analysis is the most CPU-heavy job; the scheduler runs every 30 minutes. */
const ALERT_STALE_AFTER_MS = 28 * 60_000

async function runAlertCycle() {
  const freshness = await refreshTodayIfStale({ waitLimitMs: Infinity, staleAfterMs: ALERT_STALE_AFTER_MS })
  const synced = freshness.some((f) => f.status === 'synced')
  if (synced) await runAnalysis('sync', null)
  const notifications = await dispatchNotifications()
  return { freshness, analyzed: synced, notifications }
}

/**
 * Called every 30 minutes by an external scheduler (cron-job.org caps requests at 30s).
 * Responds immediately and runs the sync → analysis → WhatsApp dispatch cycle in `after()`,
 * which keeps the function alive up to maxDuration. Pass `&wait=1` to run inline and see the result.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (request.nextUrl.searchParams.get('wait') === '1') {
    return NextResponse.json(await runAlertCycle())
  }

  after(async () => {
    try {
      const result = await runAlertCycle()
      console.log('[alerts] cycle finished', JSON.stringify(result))
    } catch (err) {
      console.error('[alerts] cycle failed', (err as Error).message)
    }
  })

  return NextResponse.json({ accepted: true, startedAt: new Date().toISOString() }, { status: 202 })
}

import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { runAnalysis } from '@/lib/analysis'
import { dispatchNotifications } from '@/lib/notify/dispatch'
import { refreshTodayIfStale } from '@/lib/sync/freshen'

export const maxDuration = 300

/**
 * Called every 30 minutes by an external scheduler (e.g. cron-job.org):
 * refreshes today's data (stock included), re-runs the engine when something synced,
 * then sends whatever crossed a threshold to the WhatsApp group.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const freshness = await refreshTodayIfStale()
  const synced = freshness.some((f) => f.status === 'synced')
  if (synced) await runAnalysis('sync', null)

  const notifications = await dispatchNotifications()
  return NextResponse.json({ freshness, analyzed: synced, notifications })
}

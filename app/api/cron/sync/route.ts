import { NextResponse, type NextRequest } from 'next/server'
import { logAudit } from '@/lib/audit'
import { isCronAuthorized } from '@/lib/cron-auth'
import { pool } from '@/lib/db'
import { runAnalysis } from '@/lib/analysis'
import { dispatchNotifications } from '@/lib/notify/dispatch'
import { syncRange } from '@/lib/sync/range'
import { runSync } from '@/lib/sync/ingest'
import { syncMeliAds } from '@/lib/profit/ads-sync'
import { syncCatalogFromProducts } from '@/lib/catalog/sync'

export const maxDuration = 300

/** Scheduled: sync every connected source, then always analyze (test deadlines advance even without new data). */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { rows } = await pool.query<{ code: string }>(
    `SELECT DISTINCT m.code FROM marketplace_connections c JOIN marketplaces m ON m.id = c.marketplace_id
      WHERE c.status = 'connected'`,
  )
  const range = syncRange(3)
  const results: Record<string, unknown> = {}
  for (const { code } of rows) results[code] = await runSync(code, range)
  if (rows.some((r) => r.code === 'mercado_livre')) {
    // Re-read a week: the ML revises recent days' Ads cost after the fact.
    results.mercado_livre_ads = await syncMeliAds(syncRange(7)).catch((err: Error) => ({ status: 'error', detail: err.message }))
  }
  results.catalog = await syncCatalogFromProducts().catch((err: Error) => ({ status: 'error', detail: err.message }))
  if (rows.length) {
    await logAudit({ user: null, action: 'sync.scheduled', entityType: 'sync_jobs', newValue: { range, results } })
  }

  const analysis = await runAnalysis(rows.length ? 'sync' : 'scheduled', null)
  const notifications = await dispatchNotifications().catch((err: Error) => ({ status: 'error', detail: err.message }))
  return NextResponse.json({ range, results, analysis, notifications })
}

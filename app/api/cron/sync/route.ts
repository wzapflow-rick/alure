import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { logAudit } from '@/lib/audit'
import { pool } from '@/lib/db'
import { runAnalysis } from '@/lib/analysis'
import { syncRange } from '@/lib/sync/range'
import { runSync } from '@/lib/sync/ingest'

export const maxDuration = 300

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Scheduled: sync every connected source, then always analyze (test deadlines advance even without new data). */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { rows } = await pool.query<{ code: string }>(
    `SELECT DISTINCT m.code FROM marketplace_connections c JOIN marketplaces m ON m.id = c.marketplace_id
      WHERE c.status = 'connected'`,
  )
  const range = syncRange(3)
  const results: Record<string, unknown> = {}
  for (const { code } of rows) results[code] = await runSync(code, range)
  if (rows.length) {
    await logAudit({ user: null, action: 'sync.scheduled', entityType: 'sync_jobs', newValue: { range, results } })
  }

  const analysis = await runAnalysis(rows.length ? 'sync' : 'scheduled', null)
  return NextResponse.json({ range, results, analysis })
}

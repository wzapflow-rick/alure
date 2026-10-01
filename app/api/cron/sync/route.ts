import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { logAudit } from '@/lib/audit'
import { pool } from '@/lib/db'
import { runEngine } from '@/lib/engine/run'
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
    await runEngine(null)
    await logAudit({ user: null, action: 'sync.scheduled', entityType: 'sync_jobs', newValue: { range, results } })
  }
  return NextResponse.json({ range, results })
}

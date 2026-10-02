import { pool } from '@/lib/db'
import { syncRange } from '@/lib/sync/range'
import { runSync } from '@/lib/sync/ingest'

const STALE_AFTER_MS = 10 * 60_000
const RUNNING_GRACE_MS = 3 * 60_000
const WAIT_LIMIT_MS = 25_000

export type FreshnessResult = { code: string; status: 'fresh' | 'synced' | 'running' | 'timeout' | 'error'; detail?: string }

/**
 * The scheduled cron runs once a day, so intraday sales only reach the database
 * when something triggers a sync. Re-syncs today's window for every connected
 * channel whose last successful sync is older than STALE_AFTER_MS.
 */
export async function refreshTodayIfStale({ waitLimitMs = WAIT_LIMIT_MS }: { waitLimitMs?: number } = {}): Promise<
  FreshnessResult[]
> {
  const { rows } = await pool.query<{ code: string; last_success: Date | null; running_since: Date | null }>(
    `SELECT m.code,
            (SELECT MAX(j.finished_at) FROM sync_jobs j WHERE j.marketplace_id = m.id AND j.status = 'success') AS last_success,
            (SELECT MAX(j.started_at)  FROM sync_jobs j WHERE j.marketplace_id = m.id AND j.status = 'running') AS running_since
       FROM marketplace_connections c
       JOIN marketplaces m ON m.id = c.marketplace_id
      WHERE c.status = 'connected'
      GROUP BY m.id, m.code`,
  )

  const now = Date.now()
  return Promise.all(
    rows.map(async ({ code, last_success, running_since }): Promise<FreshnessResult> => {
      if (last_success && now - new Date(last_success).getTime() < STALE_AFTER_MS) return { code, status: 'fresh' }
      if (running_since && now - new Date(running_since).getTime() < RUNNING_GRACE_MS) return { code, status: 'running' }

      const sync = runSync(code, syncRange(1)).then(
        (r): FreshnessResult =>
          r.status === 'success' ? { code, status: 'synced' } : { code, status: 'error', detail: r.error },
        (err: Error): FreshnessResult => ({ code, status: 'error', detail: err.message }),
      )
      if (!Number.isFinite(waitLimitMs)) return sync
      const timeout = new Promise<FreshnessResult>((resolve) =>
        setTimeout(() => resolve({ code, status: 'timeout' }), waitLimitMs),
      )
      return Promise.race([sync, timeout])
    }),
  )
}

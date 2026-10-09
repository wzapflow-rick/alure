import { pool } from '@/lib/db'

type Rule = { window: number; max: number }

let missingTableWarned = false

/**
 * Login attempts are counted in Postgres so the limit holds across every serverless instance
 * (in-memory counters reset per instance). Fails open if the table is missing, so a pending
 * migration never locks the team out.
 */
export const authRateLimitStorage = {
  async consume(key: string, rule: Rule) {
    const now = Date.now()
    const windowMs = rule.window * 1000
    try {
      const { rows } = await pool.query<{ count: number; last_request: string }>(
        `INSERT INTO auth_rate_limit (key, count, last_request) VALUES ($1, 1, $2)
         ON CONFLICT (key) DO UPDATE SET
           count        = CASE WHEN $2 - auth_rate_limit.last_request >= $3 THEN 1 ELSE auth_rate_limit.count + 1 END,
           last_request = CASE WHEN $2 - auth_rate_limit.last_request >= $3 THEN $2 ELSE auth_rate_limit.last_request END
         RETURNING count, last_request`,
        [key, now, windowMs],
      )
      const row = rows[0]
      if (!row || row.count <= rule.max) return { allowed: true, retryAfter: null }
      const retryAfter = Math.max(1, Math.ceil((Number(row.last_request) + windowMs - now) / 1000))
      return { allowed: false, retryAfter }
    } catch (error) {
      if (!missingTableWarned) {
        missingTableWarned = true
        console.error('[alure] auth rate limit unavailable (rode db/020_seguranca.sql):', (error as Error).message)
      }
      return { allowed: true, retryAfter: null }
    }
  },
}

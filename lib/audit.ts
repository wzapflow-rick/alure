import 'server-only'
import type { PoolClient } from 'pg'
import { pool } from '@/lib/db'
import type { SessionUser } from '@/lib/session'

type AuditEntry = {
  user: SessionUser | null
  action: string
  entityType: string
  entityId?: string | number | null
  oldValue?: unknown
  newValue?: unknown
  reason?: string | null
}

export async function logAudit(entry: AuditEntry, client?: PoolClient) {
  const runner = client ?? pool
  await runner.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_value, new_value, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.user?.id ?? null,
      entry.user?.email ?? null,
      entry.action,
      entry.entityType,
      entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
      entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
      entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
      entry.reason ?? null,
    ],
  )
}

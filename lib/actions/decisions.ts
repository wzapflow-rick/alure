'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import { withTransaction } from '@/lib/db'
import { ruleMeta } from '@/lib/engine/rules'
import { logAudit } from '@/lib/audit'
import { runAnalysis } from '@/lib/analysis'
import { hasAlertHistory } from '@/lib/engine/run'
import { authed, failure, formObject, optionalText, type ActionState } from '@/lib/actions/shared'

/**
 * Approving a recommendation writes an automatic memory record (kind 'context', so it never
 * freezes the product) with the review date; the engine measures the outcome on that date.
 * Linking columns come from migration 005 — without them the approval still succeeds.
 */
async function rememberApproval(client: PoolClient, recommendationId: number, note: string | null, userId: string) {
  const { rows } = await client.query<{ rule_code: string; title: string; recommendation: string; reason: string; objective: string; product_id: string | null; product_channel_id: string | null; marketplace_id: string | null }>(
    `SELECT rule_code, title, recommendation, reason, objective, product_id, product_channel_id, marketplace_id
       FROM recommendations WHERE id = $1`,
    [recommendationId],
  )
  const r = rows[0]
  if (!r?.product_id) return
  const reviewDays = Math.max(3, ruleMeta(r.rule_code).reviewDays)
  await client.query('SAVEPOINT remember_approval')
  try {
    await client.query(
      `INSERT INTO strategic_memory (kind, subject, decision, reason, expected_result, product_id, marketplace_id, user_id,
                                     recommendation_id, product_channel_id, review_date)
       VALUES ('context', $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE + $10::int)`,
      [
        `Recomendação aprovada · ${r.title}`,
        `Aprovado: ${r.recommendation}${note ? ` (${note})` : ''}`,
        r.reason,
        r.objective,
        r.product_id, r.marketplace_id, userId, recommendationId, r.product_channel_id, reviewDays,
      ],
    )
    await client.query('RELEASE SAVEPOINT remember_approval')
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT remember_approval')
    if ((e as { code?: string }).code !== '42703') throw e
  }
}

const recSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(['approved', 'dismissed', 'open']),
  note: optionalText,
})

export async function updateRecommendation(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = recSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string }>(
        'SELECT status FROM recommendations WHERE id = $1 FOR UPDATE',
        [input.id],
      )
      if (!rows[0]) throw new Error('not found')
      await client.query(
        `UPDATE recommendations SET status = $2, resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END, updated_at = now() WHERE id = $1`,
        [input.id, input.status],
      )
      await client.query(
        `INSERT INTO recommendation_events (recommendation_id, event, note, user_id) VALUES ($1, $2, $3, $4)`,
        [input.id, input.status === 'open' ? 'reopened' : input.status, input.note, user.id],
      )
      if (input.status === 'approved') await rememberApproval(client, input.id, input.note, user.id)
      await logAudit(
        {
          user,
          action: `recommendation.${input.status}`,
          entityType: 'recommendations',
          entityId: input.id,
          oldValue: { status: rows[0].status },
          newValue: { status: input.status },
          reason: input.note,
        },
        client,
      )
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

const alertSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(['acknowledged', 'resolved', 'dismissed']),
})

export async function updateAlert(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = alertSchema.parse(formObject(formData))
    const historyEnabled = await hasAlertHistory()
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ severity: string }>(
        'UPDATE alerts SET status = $2, updated_at = now() WHERE id = $1 RETURNING severity',
        [input.id, input.status],
      )
      if (historyEnabled && rows[0]) {
        await client.query(
          'INSERT INTO alert_events (alert_id, event, severity, user_id) VALUES ($1,$2,$3,$4)',
          [input.id, input.status, rows[0].severity, user.id],
        )
      }
      await logAudit({ user, action: `alert.${input.status}`, entityType: 'alerts', entityId: input.id }, client)
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

export async function runEngineAction(_: ActionState): Promise<ActionState> {
  try {
    const user = await authed()
    const r = await runAnalysis('manual', user)
    revalidatePath('/', 'layout')
    if (r.skipped) return { ok: true, message: 'Uma análise já está em andamento. Recarregue em instantes.' }
    return {
      ok: true,
      message: `${r.channelsAnalyzed} canais analisados · ${r.created} novas · ${r.resolved} resolvidas.`,
    }
  } catch (e) {
    return failure(e)
  }
}

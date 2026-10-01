'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { runEngine } from '@/lib/engine/run'
import { generateDailyBrief } from '@/lib/brief'
import { authed, failure, formObject, optionalText, type ActionState } from '@/lib/actions/shared'

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
  status: z.enum(['acknowledged', 'resolved']),
})

export async function updateAlert(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = alertSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      await client.query('UPDATE alerts SET status = $2, updated_at = now() WHERE id = $1', [input.id, input.status])
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
    const r = await runEngine(user)
    await generateDailyBrief(user)
    revalidatePath('/', 'layout')
    return {
      ok: true,
      message: `${r.channelsAnalyzed} canais analisados · ${r.created} novas · ${r.resolved} resolvidas.`,
    }
  } catch (e) {
    return failure(e)
  }
}

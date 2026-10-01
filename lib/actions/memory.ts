'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { ENGINE_SETTINGS_KEY, engineSettingsSchema } from '@/lib/settings'
import { authed, failure, formObject, isoDate, optionalText, type ActionState } from '@/lib/actions/shared'

const memorySchema = z.object({
  memoryDate: isoDate,
  kind: z.enum(['decision', 'rule', 'context']),
  subject: z.string().trim().min(2, 'Informe o assunto').max(200),
  decision: z.string().trim().min(2, 'Descreva a decisão').max(2000),
  reason: optionalText,
  expectedResult: optionalText,
  productId: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null)),
})

export async function addMemory(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = memorySchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO strategic_memory (memory_date, kind, subject, decision, reason, expected_result, product_id, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [input.memoryDate, input.kind, input.subject, input.decision, input.reason, input.expectedResult, input.productId, user.id],
      )
      await logAudit({ user, action: 'memory.create', entityType: 'strategic_memory', entityId: rows[0].id, newValue: input }, client)
    })
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Registrado na memória estratégica.' }
  } catch (e) {
    return failure(e)
  }
}

export async function archiveMemory(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id, status } = z
      .object({ id: z.coerce.number().int().positive(), status: z.enum(['active', 'superseded', 'archived']) })
      .parse(formObject(formData))
    await withTransaction(async (client) => {
      await client.query('UPDATE strategic_memory SET status=$2, updated_at=now() WHERE id=$1', [id, status])
      await logAudit({ user, action: `memory.${status}`, entityType: 'strategic_memory', entityId: id }, client)
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

export async function saveEngineSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = engineSettingsSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const old = await client.query('SELECT value FROM app_settings WHERE key = $1', [ENGINE_SETTINGS_KEY])
      await client.query(
        `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [ENGINE_SETTINGS_KEY, JSON.stringify(input), user.id],
      )
      await logAudit(
        { user, action: 'settings.update', entityType: 'app_settings', entityId: ENGINE_SETTINGS_KEY, oldValue: old.rows[0]?.value, newValue: input },
        client,
      )
    })
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Parâmetros salvos. Rode o motor para aplicar.' }
  } catch (e) {
    return failure(e)
  }
}

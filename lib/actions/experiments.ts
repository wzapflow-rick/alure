'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { todayISO } from '@/lib/format'
import { authed, failure, formObject, isoDate, optionalText, type ActionState } from '@/lib/actions/shared'

const VARIABLES = ['price', 'title', 'images', 'description', 'promotion', 'ads', 'shipping', 'other'] as const
const DECISIONS = ['keep', 'revert', 'continue', 'new_test'] as const

const createSchema = z
  .object({
    productChannelId: z.coerce.number().int().positive('Selecione o canal'),
    variable: z.enum(VARIABLES),
    previousValue: z.string().trim().min(1, 'Informe o valor anterior').max(500),
    newValue: z.string().trim().min(1, 'Informe o novo valor').max(500),
    hypothesis: z.string().trim().min(10, 'Descreva a hipótese').max(1000),
    startDate: isoDate,
    evaluationDate: isoDate,
    primaryMetric: z.string().trim().min(2).max(80),
    secondaryMetrics: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  })
  .refine((v) => v.evaluationDate >= v.startDate, 'A avaliação deve ser depois do início')

export async function createExperiment(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null
  try {
    const user = await authed()
    const input = createSchema.parse(formObject(formData))
    id = await withTransaction(async (client) => {
      const ch = await client.query<{ product_id: string; marketplace_id: string; current_price: string }>(
        'SELECT product_id, marketplace_id, current_price FROM product_channels WHERE id = $1',
        [input.productChannelId],
      )
      const channel = ch.rows[0]
      if (!channel) throw new Error('not found')

      // One test per product/channel at a time keeps attribution clean.
      const conflict = await client.query(
        `SELECT id FROM experiments WHERE product_channel_id = $1 AND status IN ('planned','in_progress','ready_for_review')`,
        [input.productChannelId],
      )
      if (conflict.rows.length) throw Object.assign(new Error('conflict'), { userMessage: 'Já existe um teste aberto neste canal.' })

      const status = input.startDate > todayISO() ? 'planned' : 'in_progress'
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO experiments (product_id, product_channel_id, marketplace_id, variable, previous_value, new_value,
                                  hypothesis, start_date, evaluation_date, primary_metric, secondary_metrics, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          channel.product_id, input.productChannelId, channel.marketplace_id, input.variable, input.previousValue,
          input.newValue, input.hypothesis, input.startDate, input.evaluationDate, input.primaryMetric,
          input.secondaryMetrics, status, user.id,
        ],
      )
      await logAudit({ user, action: 'experiment.create', entityType: 'experiments', entityId: rows[0].id, newValue: input }, client)
      return rows[0].id
    })
    revalidatePath('/', 'layout')
  } catch (e) {
    const userMessage = (e as { userMessage?: string }).userMessage
    if (userMessage) return { ok: false, message: userMessage }
    return failure(e)
  }
  redirect(`/testes/${id}`)
}

const decideSchema = z.object({
  id: z.coerce.number().int().positive(),
  decision: z.enum(DECISIONS),
  result: z.string().trim().min(5, 'Descreva o resultado observado').max(2000),
  notes: optionalText,
  saveToMemory: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
})

export async function decideExperiment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = decideSchema.parse(formObject(formData))
    await withTransaction(async (client) => {
      const { rows } = await client.query<{
        status: string
        product_id: string
        marketplace_id: string
        variable: string
        new_value: string
        hypothesis: string
      }>('SELECT * FROM experiments WHERE id = $1 FOR UPDATE', [input.id])
      const exp = rows[0]
      if (!exp) throw new Error('not found')

      const finalStatus = input.decision === 'continue' ? 'in_progress' : 'completed'
      await client.query(
        `UPDATE experiments SET status=$2, decision=$3, result=$4, decision_notes=$5, decided_by=$6,
                decided_at=now(), updated_at=now() WHERE id=$1`,
        [input.id, finalStatus, input.decision, input.result, input.notes, user.id],
      )
      await client.query(
        `UPDATE recommendations SET status='resolved', resolved_at=now(), updated_at=now()
          WHERE experiment_id = $1 AND kind = 'test_review' AND status = 'open'`,
        [input.id],
      )
      if (input.saveToMemory && input.decision !== 'continue') {
        await client.query(
          `INSERT INTO strategic_memory (kind, subject, decision, reason, expected_result, product_id, marketplace_id, experiment_id, user_id)
           VALUES ('decision', $1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            `Teste #${String(input.id).padStart(4, '0')} · ${exp.variable}`,
            input.decision === 'keep' ? `Manter ${exp.new_value}` : input.decision === 'revert' ? 'Reverter para o valor anterior' : 'Abrir novo teste',
            input.result,
            input.notes,
            exp.product_id,
            exp.marketplace_id,
            input.id,
            user.id,
          ],
        )
      }
      await logAudit(
        { user, action: 'experiment.decide', entityType: 'experiments', entityId: input.id, oldValue: { status: exp.status }, newValue: input },
        client,
      )
    })
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Decisão registrada.' }
  } catch (e) {
    return failure(e)
  }
}

export async function cancelExperiment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(formObject(formData))
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE experiments SET status='cancelled', updated_at=now() WHERE id=$1 AND status <> 'completed'`,
        [id],
      )
      await logAudit({ user, action: 'experiment.cancel', entityType: 'experiments', entityId: id }, client)
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return failure(e)
  }
}

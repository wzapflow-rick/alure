'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { pool } from '@/lib/db'
import { deliver, dispatchNotifications } from '@/lib/notify/dispatch'
import { type ActionState, authed, failure, formObject, optionalText } from '@/lib/actions/shared'

const PATH = '/configuracoes'

export async function sendTestNotification(_: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const ok = await deliver('test', `test:${Date.now()}`, `*ALURE · TESTE*\n\nAvisos do Alure conectados a este grupo. Enviado por ${user.email}.`)
    revalidatePath(PATH)
    return ok ? { ok: true, message: 'Mensagem enviada ao grupo.' } : { ok: false, message: 'Falha no envio. Veja o erro no histórico abaixo.' }
  } catch (error) {
    return failure(error)
  }
}

const STATUS_TEXT: Record<string, string> = {
  not_configured: 'Evolution API ou grupo ainda não configurados.',
  quiet_hours: 'Fora do horário de envio (7h–22h). Nada foi enviado.',
  missing_schema: 'Rode o script db/006_notifications.sql no banco.',
}

export async function runNotificationsNow(_: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const result = await dispatchNotifications()
    await logAudit({ user, action: 'notifications.manual_run', entityType: 'notification_log', newValue: result })
    revalidatePath(PATH)
    if (result.status !== 'done') return { ok: false, message: STATUS_TEXT[result.status] }
    const total = result.stock + result.opportunities + result.reminders
    return {
      ok: true,
      message: total
        ? `Enviado: ${result.stock} de estoque, ${result.opportunities} oportunidade(s), ${result.reminders} lembrete(s).`
        : 'Nada novo para avisar agora.',
    }
  } catch (error) {
    return failure(error)
  }
}

const reminderSchema = z.object({
  title: z.string().trim().min(3, 'Dê um título ao lembrete.').max(120),
  message: optionalText,
  hour: z.coerce.number().int().min(7, 'Horário entre 7h e 21h.').max(21, 'Horário entre 7h e 21h.'),
})

export async function createReminder(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const data = reminderSchema.parse(formObject(formData))
    const weekdays = formData
      .getAll('weekdays')
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    if (!weekdays.length) return { ok: false, message: 'Escolha pelo menos um dia da semana.' }
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO notification_reminders (title, message, weekdays, hour) VALUES ($1,$2,$3::smallint[],$4) RETURNING id`,
      [data.title, data.message, weekdays, data.hour],
    )
    await logAudit({ user, action: 'reminder.created', entityType: 'notification_reminders', entityId: rows[0]?.id, newValue: { ...data, weekdays } })
    revalidatePath(PATH)
    return { ok: true, message: 'Lembrete criado.' }
  } catch (error) {
    return failure(error)
  }
}

const idSchema = z.object({ id: z.coerce.number().int().positive() })

export async function toggleReminder(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = idSchema.parse(formObject(formData))
    await pool.query(`UPDATE notification_reminders SET active = NOT active, updated_at = now() WHERE id = $1`, [id])
    await logAudit({ user, action: 'reminder.toggled', entityType: 'notification_reminders', entityId: id })
    revalidatePath(PATH)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteReminder(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = idSchema.parse(formObject(formData))
    await pool.query(`DELETE FROM notification_reminders WHERE id = $1`, [id])
    await logAudit({ user, action: 'reminder.deleted', entityType: 'notification_reminders', entityId: id })
    revalidatePath(PATH)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { runEngine } from '@/lib/engine/run'
import { disconnect } from '@/lib/integrations/connections'
import { runSync } from '@/lib/sync/ingest'
import { syncRange } from '@/lib/sync/range'
import { authed, failure, formObject, type ActionState } from '@/lib/actions/shared'

const schema = z.object({
  code: z.enum(['mercado_livre', 'shopee']),
  days: z.coerce.number().int().min(1).max(60).default(30),
})

export async function syncNow(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { code, days } = schema.parse(formObject(formData))
    const range = syncRange(days)
    const result = await runSync(code, range)
    await logAudit({ user, action: 'sync.manual', entityType: 'sync_jobs', newValue: { code, range, result } })
    if (result.status === 'error') return { ok: false, message: result.error }
    await runEngine(user)
    revalidatePath('/', 'layout')
    return { ok: true, message: `Sincronizado: ${result.processed} registros (${range.from} a ${range.to}).` }
  } catch (error) {
    return failure(error)
  }
}

export async function disconnectIntegration(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { code } = schema.pick({ code: true }).parse(formObject(formData))
    await disconnect(code)
    await logAudit({ user, action: 'integration.disconnected', entityType: 'marketplace_connection', newValue: { code } })
    revalidatePath('/configuracoes')
    return { ok: true, message: 'Desconectado.' }
  } catch (error) {
    return failure(error)
  }
}

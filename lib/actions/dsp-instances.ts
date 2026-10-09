'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { pool } from '@/lib/db'
import { failure, type ActionState } from '@/lib/actions/shared'
import { logEvent } from '@/lib/broadcast/engine'
import { loadSettings } from '@/lib/broadcast/queries'
import { getInstance, slugify } from '@/lib/dsp/instances'
import { dspAuthed } from '@/lib/dsp/session'
import { createInstance, deleteInstance, evolutionServerConfig, logoutInstance, setInstanceWebhook } from '@/lib/notify/evolution'

function webhookUrl() {
  const secret = process.env.CRON_SECRET
  const base =
    process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  if (!secret || !base || /localhost/.test(base)) return null
  return `${base.replace(/\/+$/, '')}/api/webhooks/evolution?key=${encodeURIComponent(secret)}`
}

async function owned(companyId: string, fd: FormData) {
  const instance = await getInstance(companyId, String(fd.get('id') ?? ''))
  if (!instance) throw new Error('Número não encontrado nesta empresa.')
  return instance
}

export async function createNumber(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await dspAuthed()
    if (!evolutionServerConfig()) return { ok: false, message: 'Evolution API não configurada (EVOLUTION_API_URL e EVOLUTION_API_KEY).' }
    const label = z.string().trim().min(2, 'Dê um nome ao número, ex.: Comercial.').max(60).parse(fd.get('label'))
    const { rows: company } = await pool.query<{ slug: string }>(`SELECT slug FROM dsp_companies WHERE id = $1`, [user.companyId])
    const name = `dsp-${company[0]?.slug ?? user.companyId}-${slugify(label) || 'numero'}-${randomBytes(2).toString('hex')}`

    await createInstance(name, webhookUrl())
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dsp_instances (company_id, name, label) VALUES ($1, $2, $3) RETURNING id::text`,
      [user.companyId, name, label],
    )
    // New numbers start warming up: protections row created with the low starting cap.
    await loadSettings(rows[0].id)
    await logEvent({ companyId: user.companyId, instanceId: rows[0].id }, null, 'numero_criado', `Número ${label} criado. Leia o QR Code para conectar.`)
    revalidatePath('/disparos/numeros')
    return { ok: true, message: `${label} criado. Leia o QR Code abaixo com o WhatsApp do aparelho.` }
  } catch (error) {
    const message = (error as Error)?.message ?? ''
    if (/401|403|unauthorized|forbidden/i.test(message)) {
      return { ok: false, message: 'A Evolution recusou a criação. Confira se EVOLUTION_API_KEY é a chave global (AUTHENTICATION_API_KEY).' }
    }
    return failure(error)
  }
}

export async function renameNumber(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await dspAuthed()
    const instance = await owned(user.companyId, fd)
    const label = z.string().trim().min(2, 'Nome muito curto.').max(60).parse(fd.get('label'))
    await pool.query(`UPDATE dsp_instances SET label = $2 WHERE id = $1`, [instance.id, label])
    revalidatePath('/disparos', 'layout')
    return { ok: true, message: 'Nome atualizado.' }
  } catch (error) {
    return failure(error)
  }
}

export async function syncNumberWebhook(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await dspAuthed()
    const instance = await owned(user.companyId, fd)
    const url = webhookUrl()
    if (!url) return { ok: false, message: 'Defina CRON_SECRET e a URL pública do app para configurar o webhook.' }
    await setInstanceWebhook(instance.evo, url)
    return { ok: true, message: 'Webhook configurado: respostas e descadastros entram automaticamente.' }
  } catch (error) {
    return failure(error)
  }
}

export async function disconnectNumber(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await dspAuthed()
    const instance = await owned(user.companyId, fd)
    await pool.query(`UPDATE broadcast_settings SET paused_all = true, updated_at = now() WHERE id = $1`, [instance.id])
    await logoutInstance(instance.evo)
    await logEvent({ companyId: user.companyId, instanceId: instance.id }, null, 'numero_desconectado', `${instance.label} desconectado manualmente; envios pausados.`)
    revalidatePath('/disparos/numeros')
    return { ok: true, message: 'Número desconectado e envios pausados.' }
  } catch (error) {
    return failure(error)
  }
}

export async function removeNumber(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await dspAuthed()
    const instance = await owned(user.companyId, fd)
    if (!instance.name) return { ok: false, message: 'O número principal (EVOLUTION_INSTANCE) também avisa os pedidos da ALURE e não pode ser excluído aqui.' }
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM broadcast_campaigns WHERE instance_id = $1 AND status IN ('running','paused')`,
      [instance.id],
    )
    if (rows[0]?.n) return { ok: false, message: 'Cancele ou conclua as campanhas deste número antes de excluí-lo.' }
    await deleteInstance(instance.evo)
    await pool.query(`UPDATE dsp_instances SET deleted_at = now() WHERE id = $1`, [instance.id])
    await logEvent({ companyId: user.companyId, instanceId: instance.id }, null, 'numero_excluido', `${instance.label} excluído.`)
    revalidatePath('/disparos/numeros')
    return { ok: true, message: 'Número excluído.' }
  } catch (error) {
    return failure(error)
  }
}

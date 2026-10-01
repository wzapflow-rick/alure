import 'server-only'
import { z } from 'zod'
import { getSessionUser, type SessionUser } from '@/lib/session'

export type ActionState = { ok: boolean; message?: string } | null

export async function authed(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente.')
  return user
}

export function formObject(formData: FormData) {
  const obj: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') obj[k] = v
  return obj
}

export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null))

export const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === '' ? null : Number(v.replace(',', '.'))))
  .refine((v) => v === null || Number.isFinite(v), 'Número inválido')

export const money = z
  .string()
  .trim()
  .transform((v) => Number(v.replace(',', '.')))
  .refine((v) => Number.isFinite(v) && v >= 0, 'Valor inválido')

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')

export function failure(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const message = (error as Error)?.message ?? ''
  if (message.startsWith('Sessão')) return { ok: false, message }
  if ((error as { code?: string })?.code === '23505') return { ok: false, message: 'Registro duplicado.' }
  console.error('[alure] action failed:', error)
  return { ok: false, message: 'Não foi possível salvar. Tente novamente.' }
}

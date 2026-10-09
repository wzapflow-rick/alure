'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { pool } from '@/lib/db'
import { failure, type ActionState } from '@/lib/actions/shared'
import { authRateLimitStorage } from '@/lib/auth-rate-limit'
import { getSessionUser } from '@/lib/session'
import { hashPassword, verifyPassword } from '@/lib/dsp/password'
import { createDspSession, destroyDspSession, dspAdminAuthed, dspAuthed, hasAnyDspUser, setSessionCompany } from '@/lib/dsp/session'

const email = z.string().trim().toLowerCase().email('E-mail inválido.')
const password = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(200)

async function clientIp() {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local'
}

export async function loginDsp(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const mail = email.parse(fd.get('email'))
    const pass = String(fd.get('password') ?? '')
    const limit = await authRateLimitStorage.consume(`dsp:${await clientIp()}:${mail}`, { window: 900, max: 10 })
    if (!limit.allowed) return { ok: false, message: `Muitas tentativas. Tente de novo em ${Math.ceil((limit.retryAfter ?? 60) / 60)} min.` }

    const { rows } = await pool.query<{ id: string; password_hash: string; company_id: string | null; active: boolean; company_active: boolean | null }>(
      `SELECT u.id::text, u.password_hash, u.company_id::text, u.active, c.active AS company_active
         FROM dsp_users u LEFT JOIN dsp_companies c ON c.id = u.company_id WHERE u.email = $1`,
      [mail],
    )
    const user = rows[0]
    const valid = user ? await verifyPassword(pass, user.password_hash) : await verifyPassword(pass, 'scrypt$00$00').catch(() => false)
    if (!user || !valid) return { ok: false, message: 'E-mail ou senha incorretos.' }
    if (!user.active || user.company_active === false) return { ok: false, message: 'Este acesso está desativado. Fale com o administrador.' }
    await createDspSession(user.id, user.company_id)
  } catch (error) {
    return failure(error)
  }
  redirect('/disparos')
}

/** First access only: whoever is logged into the ALURE panel becomes the Disparos admin. */
export async function bootstrapDspAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (await hasAnyDspUser()) return { ok: false, message: 'O administrador já foi criado. Entre com e-mail e senha.' }
    const alureUser = await getSessionUser()
    if (!alureUser) return { ok: false, message: 'Entre no painel da ALURE neste navegador para criar o primeiro administrador.' }
    const v = z.object({ name: z.string().trim().min(2, 'Informe seu nome.').max(80), email, password }).parse({
      name: fd.get('name'),
      email: fd.get('email'),
      password: fd.get('password'),
    })
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dsp_users (company_id, email, name, password_hash, role) VALUES (1, $1, $2, $3, 'admin') RETURNING id::text`,
      [v.email, v.name, await hashPassword(v.password)],
    )
    await createDspSession(rows[0].id, '1')
  } catch (error) {
    return failure(error)
  }
  redirect('/disparos')
}

export async function logoutDsp() {
  await destroyDspSession()
  redirect('/disparos/entrar')
}

export async function switchCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await dspAdminAuthed()
    const id = z.string().regex(/^\d+$/).parse(String(fd.get('company_id') ?? ''))
    await setSessionCompany(id)
  } catch (error) {
    return failure(error)
  }
  redirect('/disparos')
}

export async function changeOwnPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await dspAuthed()
    const current = String(fd.get('current') ?? '')
    const next = password.parse(fd.get('password'))
    const { rows } = await pool.query<{ password_hash: string }>(`SELECT password_hash FROM dsp_users WHERE id = $1`, [user.id])
    if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) return { ok: false, message: 'Senha atual incorreta.' }
    await pool.query(`UPDATE dsp_users SET password_hash = $2 WHERE id = $1`, [user.id, await hashPassword(next)])
    return { ok: true, message: 'Senha alterada.' }
  } catch (error) {
    return failure(error)
  }
}

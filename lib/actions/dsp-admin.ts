'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { pool } from '@/lib/db'
import { failure, type ActionState } from '@/lib/actions/shared'
import { hashPassword } from '@/lib/dsp/password'
import { slugify } from '@/lib/dsp/instances'
import { dspAdminAuthed } from '@/lib/dsp/session'

const id = z.string().regex(/^\d+$/, 'Registro inválido.')
const password = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(200)

export async function createCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await dspAdminAuthed()
    const name = z.string().trim().min(2, 'Informe o nome da empresa.').max(80).parse(fd.get('name'))
    const base = slugify(name) || 'empresa'
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO dsp_companies (name, slug)
       VALUES ($1, $2 || CASE WHEN EXISTS (SELECT 1 FROM dsp_companies WHERE slug = $2) THEN '-' || (SELECT count(*) + 1 FROM dsp_companies) ELSE '' END)
       RETURNING id::text`,
      [name, base],
    )
    await pool.query(`INSERT INTO prospect_settings (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [rows[0].id]).catch(() => {})
    revalidatePath('/disparos/admin')
    return { ok: true, message: `${name} criada.` }
  } catch (error) {
    return failure(error)
  }
}

export async function setCompanyActive(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await dspAdminAuthed()
    const companyId = id.parse(String(fd.get('id')))
    if (companyId === '1') return { ok: false, message: 'A empresa principal não pode ser desativada.' }
    await pool.query(`UPDATE dsp_companies SET active = $2 WHERE id = $1`, [companyId, fd.get('active') === 'true'])
    revalidatePath('/disparos/admin')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function createDspUser(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await dspAdminAuthed()
    const v = z
      .object({
        name: z.string().trim().min(2, 'Informe o nome.').max(80),
        email: z.string().trim().toLowerCase().email('E-mail inválido.'),
        password,
        company_id: id,
        role: z.enum(['admin', 'member']),
      })
      .parse({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), company_id: fd.get('company_id'), role: fd.get('role') ?? 'member' })
    await pool.query(`INSERT INTO dsp_users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)`, [
      v.company_id,
      v.email,
      v.name,
      await hashPassword(v.password),
      v.role,
    ])
    revalidatePath('/disparos/admin')
    return { ok: true, message: `Acesso criado para ${v.email}. Envie a senha por um canal seguro.` }
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return { ok: false, message: 'Já existe um acesso com esse e-mail.' }
    return failure(error)
  }
}

export async function resetDspPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await dspAdminAuthed()
    const userId = id.parse(String(fd.get('id')))
    const next = password.parse(fd.get('password'))
    await pool.query(`UPDATE dsp_users SET password_hash = $2 WHERE id = $1`, [userId, await hashPassword(next)])
    await pool.query(`DELETE FROM dsp_sessions WHERE user_id = $1`, [userId])
    return { ok: true, message: 'Senha trocada. As sessões abertas desse acesso foram encerradas.' }
  } catch (error) {
    return failure(error)
  }
}

export async function setDspUserActive(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await dspAdminAuthed()
    const userId = id.parse(String(fd.get('id')))
    if (userId === me.id) return { ok: false, message: 'Você não pode desativar o próprio acesso.' }
    const active = fd.get('active') === 'true'
    await pool.query(`UPDATE dsp_users SET active = $2 WHERE id = $1`, [userId, active])
    if (!active) await pool.query(`DELETE FROM dsp_sessions WHERE user_id = $1`, [userId])
    revalidatePath('/disparos/admin')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

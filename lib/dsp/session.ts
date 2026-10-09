import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { pool } from '@/lib/db'

export const DSP_COOKIE = 'dsp_session'
const SESSION_DAYS = 30

export type DspUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  companyId: string
  companyName: string
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

function cookieOptions(maxAgeSeconds: number) {
  const prod = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: true,
    // The v0 preview runs inside a cross-site iframe, where lax cookies are never sent.
    sameSite: prod ? ('lax' as const) : ('none' as const),
    path: '/disparos',
    maxAge: maxAgeSeconds,
  }
}

export async function createDspSession(userId: string, companyId: string | null) {
  const token = randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO dsp_sessions (token_hash, user_id, company_id, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [hashToken(token), userId, companyId, SESSION_DAYS],
  )
  await pool.query(`UPDATE dsp_users SET last_login_at = now() WHERE id = $1`, [userId])
  const jar = await cookies()
  jar.set(DSP_COOKIE, token, cookieOptions(SESSION_DAYS * 86400))
}

export async function destroyDspSession() {
  const jar = await cookies()
  const token = jar.get(DSP_COOKIE)?.value
  if (token) await pool.query(`DELETE FROM dsp_sessions WHERE token_hash = $1`, [hashToken(token)]).catch(() => {})
  jar.set(DSP_COOKIE, '', cookieOptions(0))
}

async function currentTokenHash() {
  const token = (await cookies()).get(DSP_COOKIE)?.value
  return token ? hashToken(token) : null
}

/** Admins can act as any company; members are pinned to their own. */
export const getDspUser = cache(async (): Promise<DspUser | null> => {
  const tokenHash = await currentTokenHash()
  if (!tokenHash) return null
  const { rows } = await pool
    .query<DspUser>(
      `SELECT u.id::text, u.email, u.name, u.role, c.id::text AS "companyId", c.name AS "companyName"
         FROM dsp_sessions s
         JOIN dsp_users u ON u.id = s.user_id AND u.active
         JOIN LATERAL (
           SELECT c.id, c.name FROM dsp_companies c
            WHERE u.role = 'admin' OR (c.id = u.company_id AND c.active)
            ORDER BY (c.id = COALESCE(s.company_id, u.company_id)) DESC NULLS LAST, c.id
            LIMIT 1
         ) c ON true
        WHERE s.token_hash = $1 AND s.expires_at > now()
        LIMIT 1`,
      [tokenHash],
    )
    .catch(() => ({ rows: [] as DspUser[] }))
  return rows[0] ?? null
})

export async function requireDspUser() {
  const user = await getDspUser()
  if (!user) redirect('/disparos/entrar')
  return user
}

export async function requireDspAdmin() {
  const user = await requireDspUser()
  if (user.role !== 'admin') redirect('/disparos')
  return user
}

/** For server actions: throws instead of redirecting so the form shows the message. */
export async function dspAuthed() {
  const user = await getDspUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente.')
  return user
}

export async function dspAdminAuthed() {
  const user = await dspAuthed()
  if (user.role !== 'admin') throw new Error('Sessão sem permissão de administrador.')
  return user
}

export async function setSessionCompany(companyId: string) {
  const tokenHash = await currentTokenHash()
  if (!tokenHash) return
  await pool.query(`UPDATE dsp_sessions SET company_id = $2 WHERE token_hash = $1`, [tokenHash, companyId])
}

export async function hasAnyDspUser() {
  const { rows } = await pool.query<{ ok: boolean }>(`SELECT EXISTS (SELECT 1 FROM dsp_users) AS ok`)
  return Boolean(rows[0]?.ok)
}

export async function dspSchemaReady() {
  const { rows } = await pool
    .query<{ ok: boolean }>(`SELECT to_regclass('public.dsp_sessions') IS NOT NULL AS ok`)
    .catch(() => ({ rows: [{ ok: false }] }))
  return Boolean(rows[0]?.ok)
}

import 'server-only'
import { pool } from '@/lib/db'

export type CompanyRow = { id: string; name: string; slug: string; active: boolean; users: number; numbers: number }

export async function listCompanies() {
  const { rows } = await pool.query<CompanyRow>(
    `SELECT c.id::text, c.name, c.slug, c.active,
            (SELECT count(*)::int FROM dsp_users u WHERE u.company_id = c.id) AS users,
            (SELECT count(*)::int FROM dsp_instances i WHERE i.company_id = c.id AND i.deleted_at IS NULL) AS numbers
       FROM dsp_companies c ORDER BY c.name`,
  )
  return rows
}

export type DspUserRow = {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  active: boolean
  company_id: string | null
  company_name: string | null
  last_login_at: string | null
}

export async function listDspUsers() {
  const { rows } = await pool.query<DspUserRow>(
    `SELECT u.id::text, u.email, u.name, u.role, u.active, u.company_id::text, c.name AS company_name, u.last_login_at::text
       FROM dsp_users u LEFT JOIN dsp_companies c ON c.id = u.company_id
      ORDER BY u.role, c.name NULLS FIRST, u.email`,
  )
  return rows
}

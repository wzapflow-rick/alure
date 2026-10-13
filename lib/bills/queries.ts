import 'server-only'
import { query, queryOne } from '@/lib/db'
import type { BillFilter } from '@/lib/bills/constants'

export type Bill = {
  id: number
  beneficiary: string
  description: string | null
  category: string
  amount: string
  due_date: string
  digitable_line: string | null
  document_number: string | null
  installment_number: number | null
  installment_total: number | null
  group_id: string | null
  status: 'open' | 'paid' | 'cancelled'
  paid_at: string | null
  paid_amount: string | null
  payment_note: string | null
  file_pathname: string | null
  file_name: string | null
  file_type: string | null
  notes: string | null
  created_at: string
}

const COLUMNS = `id, beneficiary, description, category, amount, due_date::text, digitable_line, document_number,
  installment_number, installment_total, group_id::text, status, paid_at::text, paid_amount, payment_note,
  file_pathname, file_name, file_type, notes, created_at::text`

export async function isBillsTableReady() {
  const row = await queryOne<{ ready: boolean }>(`SELECT to_regclass('public.bills') IS NOT NULL AS ready`)
  return Boolean(row?.ready)
}

const FILTER_SQL: Record<BillFilter, { where: string; order: string }> = {
  aberto: { where: `status = 'open'`, order: 'due_date ASC, id ASC' },
  vencidos: { where: `status = 'open' AND due_date < $1::date`, order: 'due_date ASC, id ASC' },
  semana: { where: `status = 'open' AND due_date BETWEEN $1::date AND $1::date + 7`, order: 'due_date ASC, id ASC' },
  pagos: { where: `status = 'paid'`, order: 'paid_at DESC NULLS LAST, id DESC' },
  cancelados: { where: `status = 'cancelled'`, order: 'updated_at DESC' },
  todos: { where: 'TRUE', order: 'due_date DESC, id DESC' },
}

export async function listBills(filter: BillFilter, today: string, search?: string) {
  const { where, order } = FILTER_SQL[filter]
  const params: unknown[] = [today]
  let searchSql = ''
  if (search) {
    params.push(`%${search}%`)
    searchSql = ` AND (beneficiary ILIKE $2 OR description ILIKE $2 OR document_number ILIKE $2)`
  }
  return query<Bill>(
    `SELECT ${COLUMNS} FROM bills WHERE ${where}${searchSql} AND $1::date IS NOT NULL ORDER BY ${order} LIMIT 300`,
    params,
  )
}

export async function getBill(id: number) {
  return queryOne<Bill>(`SELECT ${COLUMNS} FROM bills WHERE id = $1`, [id])
}

export async function listGroupBills(groupId: string) {
  return query<Pick<Bill, 'id' | 'installment_number' | 'installment_total' | 'amount' | 'due_date' | 'status' | 'paid_at'>>(
    `SELECT id, installment_number, installment_total, amount, due_date::text, status, paid_at::text
       FROM bills WHERE group_id = $1 ORDER BY installment_number NULLS LAST, due_date`,
    [groupId],
  )
}

export type BillSummary = {
  open_total: string
  open_count: number
  overdue_total: string
  overdue_count: number
  week_total: string
  week_count: number
  month_open_total: string
  paid_month_total: string
  paid_month_count: number
}

export async function getBillSummary(today: string) {
  const row = await queryOne<BillSummary>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status = 'open'), 0)                                              AS open_total,
       COUNT(*) FILTER (WHERE status = 'open')::int                                                         AS open_count,
       COALESCE(SUM(amount) FILTER (WHERE status = 'open' AND due_date < $1::date), 0)                      AS overdue_total,
       COUNT(*) FILTER (WHERE status = 'open' AND due_date < $1::date)::int                                 AS overdue_count,
       COALESCE(SUM(amount) FILTER (WHERE status = 'open' AND due_date BETWEEN $1::date AND $1::date + 7), 0) AS week_total,
       COUNT(*) FILTER (WHERE status = 'open' AND due_date BETWEEN $1::date AND $1::date + 7)::int          AS week_count,
       COALESCE(SUM(amount) FILTER (WHERE status = 'open' AND date_trunc('month', due_date) = date_trunc('month', $1::date)), 0) AS month_open_total,
       COALESCE(SUM(COALESCE(paid_amount, amount)) FILTER (WHERE status = 'paid' AND date_trunc('month', paid_at) = date_trunc('month', $1::date)), 0) AS paid_month_total,
       COUNT(*) FILTER (WHERE status = 'paid' AND date_trunc('month', paid_at) = date_trunc('month', $1::date))::int AS paid_month_count
     FROM bills`,
    [today],
  )
  return row!
}

export type DebtByBeneficiary = {
  beneficiary: string
  open_count: number
  open_total: string
  overdue_count: number
  next_due: string
}

export async function listDebtsByBeneficiary(today: string) {
  return query<DebtByBeneficiary>(
    `SELECT MIN(beneficiary) AS beneficiary,
            COUNT(*)::int AS open_count,
            SUM(amount) AS open_total,
            COUNT(*) FILTER (WHERE due_date < $1::date)::int AS overdue_count,
            MIN(due_date)::text AS next_due
       FROM bills WHERE status = 'open'
      GROUP BY lower(beneficiary)
      ORDER BY SUM(amount) DESC
      LIMIT 10`,
    [today],
  )
}

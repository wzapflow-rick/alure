'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { del, put } from '@vercel/blob'
import { queryOne, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { authed, failure, formObject, isoDate, optionalText, type ActionState } from '@/lib/actions/shared'
import { CATEGORY_VALUES, addMonthsISO, moneyToInput, parseMoneyInput } from '@/lib/bills/constants'
import { onlyDigits, parseBoleto } from '@/lib/bills/barcode'
import { extractBillFromFile } from '@/lib/bills/extract'
import { todayISO } from '@/lib/format'

const LIST_PATH = '/boletos'

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_FILE_BYTES = 10 * 1024 * 1024

function hasBlobCredentials() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

async function removeFile(pathname: string | null | undefined) {
  if (!pathname || !hasBlobCredentials()) return
  try {
    await del(pathname)
  } catch (error) {
    console.error('[alure] bill file delete failed:', error)
  }
}

export type BillDraft = {
  beneficiary: string
  description: string
  category: string
  amount: string
  due_date: string
  digitable_line: string
  document_number: string
  installment_number: string
  installment_total: string
}

export type AttachedFile = { pathname: string; name: string; type: string }

export type ExtractResult = {
  ok: boolean
  message?: string
  draft?: Partial<BillDraft>
  file?: AttachedFile | null
}

/** Uploads the boleto file (private) and pre-fills the form with what AI + the barcode can read. */
export async function extractBillFile(formData: FormData): Promise<ExtractResult> {
  try {
    const user = await authed()
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Selecione o arquivo do boleto.' }
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) return { ok: false, message: 'Envie um PDF ou uma foto (JPG, PNG ou WEBP).' }
    if (file.size > MAX_FILE_BYTES) return { ok: false, message: 'Arquivo acima de 10 MB.' }

    let attached: AttachedFile | null = null
    const notes: string[] = []
    if (hasBlobCredentials()) {
      const base = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '-').slice(0, 60) || 'boleto'
      const blob = await put(`boletos/${todayISO().slice(0, 7)}/${base}.${ext}`, file, {
        access: 'private',
        addRandomSuffix: true,
        contentType: file.type,
      })
      attached = { pathname: blob.pathname, name: file.name, type: file.type }
    } else {
      notes.push('Armazenamento de arquivos não configurado: o arquivo não foi guardado.')
    }

    const extracted = await extractBillFromFile(file, user.id)
    const draft: Partial<BillDraft> = {}
    if (extracted.ok) {
      const d = extracted.data
      if (d.beneficiary) draft.beneficiary = d.beneficiary
      if (d.description) draft.description = d.description
      if (d.category) draft.category = d.category
      if (d.amount !== null) draft.amount = moneyToInput(d.amount)
      if (d.due_date && /^\d{4}-\d{2}-\d{2}$/.test(d.due_date)) draft.due_date = d.due_date
      if (d.document_number) draft.document_number = d.document_number
      if (d.installment_number) draft.installment_number = String(d.installment_number)
      if (d.installment_total) draft.installment_total = String(d.installment_total)
      if (d.digitable_line) {
        draft.digitable_line = onlyDigits(d.digitable_line)
        const parsed = parseBoleto(draft.digitable_line, todayISO())
        if (parsed?.valid) {
          if (parsed.amount !== null) draft.amount = moneyToInput(parsed.amount)
          if (parsed.dueDate) draft.due_date = parsed.dueDate
        }
      }
    } else {
      notes.push(extracted.message)
    }

    return {
      ok: extracted.ok,
      message: notes.length ? notes.join(' ') : 'Boleto lido. Confira os campos antes de salvar.',
      draft,
      file: attached,
    }
  } catch (error) {
    const result = failure(error)
    return { ok: false, message: result?.message }
  }
}

const optionalInt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 360), 'Parcela inválida')

const billSchema = z
  .object({
    id: z.string().optional().transform((v) => (v ? Number(v) : null)),
    beneficiary: z.string().trim().min(1, 'Informe o credor (quem recebe).').max(200),
    description: optionalText,
    category: z.enum(CATEGORY_VALUES).catch('outros'),
    amount: z
      .string()
      .transform((v) => parseMoneyInput(v))
      .refine((v): v is number => v !== null && v > 0, 'Informe um valor maior que zero.'),
    due_date: isoDate,
    digitable_line: z
      .string()
      .optional()
      .transform((v) => (v ? onlyDigits(v) : null))
      .refine((v) => v === null || v === '' || [44, 47, 48].includes(v.length), 'A linha digitável deve ter 47 ou 48 números.')
      .transform((v) => v || null),
    document_number: optionalText,
    installment_number: optionalInt,
    installment_total: optionalInt,
    generate_installments: z.string().optional().transform((v) => v === 'on'),
    is_recurring: z.string().optional().transform((v) => v === 'on'),
    file_pathname: optionalText,
    file_name: optionalText,
    file_type: optionalText,
    notes: optionalText,
  })
  .refine(
    (v) => v.installment_number === null || v.installment_total === null || v.installment_number <= v.installment_total,
    'A parcela não pode ser maior que o total de parcelas.',
  )

export async function saveBill(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const v = billSchema.parse(formObject(formData))

    if (v.id) {
      const previous = await withTransaction(async (client) => {
        const { rows } = await client.query<{ file_pathname: string | null }>(`SELECT file_pathname FROM bills WHERE id = $1 FOR UPDATE`, [v.id])
        if (!rows[0]) throw new Error('Boleto não encontrado.')
        await client.query(
          `UPDATE bills SET beneficiary = $2, description = $3, category = $4, amount = $5, due_date = $6, digitable_line = $7,
                  document_number = $8, installment_number = $9, installment_total = $10,
                  file_pathname = $11, file_name = $12, file_type = $13, notes = $14, is_recurring = $15, updated_at = now()
            WHERE id = $1`,
          [v.id, v.beneficiary, v.description, v.category, v.amount, v.due_date, v.digitable_line, v.document_number,
            v.installment_number, v.installment_total, v.file_pathname, v.file_name, v.file_type, v.notes, v.is_recurring],
        )
        await logAudit({ user, action: 'bill.update', entityType: 'bill', entityId: v.id, newValue: { amount: v.amount, due_date: v.due_date } }, client)
        return rows[0]
      })
      if (previous.file_pathname && previous.file_pathname !== v.file_pathname) await removeFile(previous.file_pathname)
      revalidatePath(LIST_PATH)
      revalidatePath(`${LIST_PATH}/${v.id}`)
      return { ok: true, message: 'Alterações salvas.' }
    }

    const createFuture =
      v.generate_installments && v.installment_number !== null && v.installment_total !== null && v.installment_number < v.installment_total
    const groupId = createFuture ? randomUUID() : null

    const created = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO bills (beneficiary, description, category, amount, due_date, digitable_line, document_number,
                            installment_number, installment_total, group_id, file_pathname, file_name, file_type, notes, created_by, is_recurring)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [v.beneficiary, v.description, v.category, v.amount, v.due_date, v.digitable_line, v.document_number,
          v.installment_number, v.installment_total, groupId, v.file_pathname, v.file_name, v.file_type, v.notes, user.id, v.is_recurring],
      )
      let extra = 0
      if (createFuture) {
        for (let n = v.installment_number! + 1; n <= v.installment_total!; n++) {
          await client.query(
            `INSERT INTO bills (beneficiary, description, category, amount, due_date, document_number,
                                installment_number, installment_total, group_id, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [v.beneficiary, v.description, v.category, v.amount, addMonthsISO(v.due_date, n - v.installment_number!),
              v.document_number, n, v.installment_total, groupId, 'Parcela prevista: anexe o boleto quando chegar.', user.id],
          )
          extra++
        }
      }
      await logAudit({ user, action: 'bill.create', entityType: 'bill', entityId: rows[0].id, newValue: { amount: v.amount, due_date: v.due_date, extra } }, client)
      return extra
    })

    revalidatePath(LIST_PATH)
    return { ok: true, message: created ? `Boleto salvo, com mais ${created} parcelas previstas.` : 'Boleto salvo.' }
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return { ok: false, message: 'Este boleto já está cadastrado (mesma linha digitável).' }
    if ((error as Error)?.message === 'Boleto não encontrado.') return { ok: false, message: 'Boleto não encontrado.' }
    return failure(error)
  }
}

const idSchema = z.object({ id: z.coerce.number().int().positive() })

const paySchema = z.object({
  id: z.coerce.number().int().positive(),
  paid_at: isoDate,
  paid_amount: z.string().optional().transform((v) => (v ? parseMoneyInput(v) : null)).refine((v) => v === null || v >= 0, 'Valor pago inválido.'),
  payment_note: optionalText,
})

export async function payBill(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const v = paySchema.parse(formObject(formData))
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: number
        beneficiary: string
        description: string | null
        category: string
        amount: string
        due_date: string
        is_recurring: boolean
      }>(
        `UPDATE bills SET status = 'paid', paid_at = $2, paid_amount = COALESCE($3, amount), payment_note = $4, updated_at = now()
          WHERE id = $1 AND status = 'open'
          RETURNING id, beneficiary, description, category, amount, due_date::text, is_recurring`,
        [v.id, v.paid_at, v.paid_amount, v.payment_note],
      )
      const paid = rows[0]
      if (!paid) return null

      let nextDue: string | null = null
      if (paid.is_recurring) {
        const due = addMonthsISO(paid.due_date, 1)
        const { rowCount } = await client.query(
          `INSERT INTO bills (beneficiary, description, category, amount, due_date, is_recurring, notes, created_by)
           SELECT $1, $2, $3, $4, $5, true, 'Conta recorrente prevista: anexe o boleto quando chegar.', $6
            WHERE NOT EXISTS (
              SELECT 1 FROM bills
               WHERE is_recurring AND status <> 'cancelled'
                 AND lower(beneficiary) = lower($1) AND category = $3 AND due_date = $5::date
            )`,
          [paid.beneficiary, paid.description, paid.category, paid.amount, due, user.id],
        )
        if (rowCount) nextDue = due
      }

      await logAudit(
        { user, action: 'bill.pay', entityType: 'bill', entityId: v.id, newValue: { paid_at: v.paid_at, paid_amount: v.paid_amount, next_recurring: nextDue } },
        client,
      )
      return { nextDue }
    })
    if (!result) return { ok: false, message: 'Este boleto não está em aberto.' }
    revalidatePath(LIST_PATH)
    revalidatePath(`${LIST_PATH}/${v.id}`)
    return {
      ok: true,
      message: result.nextDue
        ? `Pagamento registrado. Conta do próximo mês lançada para ${result.nextDue.split('-').reverse().join('/')}.`
        : 'Pagamento registrado.',
    }
  } catch (error) {
    return failure(error)
  }
}

async function setStatus(formData: FormData, to: 'open' | 'cancelled', from: string, action: string): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = idSchema.parse(formObject(formData))
    const row = await queryOne<{ id: number }>(
      `UPDATE bills SET status = $2, paid_at = NULL, paid_amount = NULL, payment_note = NULL, updated_at = now()
        WHERE id = $1 AND status = ANY($3::text[]) RETURNING id`,
      [id, to, from.split(',')],
    )
    if (!row) return { ok: false, message: 'Não foi possível alterar este boleto.' }
    await logAudit({ user, action, entityType: 'bill', entityId: id })
    revalidatePath(LIST_PATH)
    revalidatePath(`${LIST_PATH}/${id}`)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function reopenBill(_: ActionState, formData: FormData) {
  return setStatus(formData, 'open', 'paid,cancelled', 'bill.reopen')
}

export async function cancelBill(_: ActionState, formData: FormData) {
  return setStatus(formData, 'cancelled', 'open', 'bill.cancel')
}

export async function deleteBill(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const { id } = idSchema.parse(formObject(formData))
    const row = await queryOne<{ file_pathname: string | null; beneficiary: string; amount: string }>(
      `DELETE FROM bills WHERE id = $1 RETURNING file_pathname, beneficiary, amount`,
      [id],
    )
    if (!row) return { ok: false, message: 'Boleto não encontrado.' }
    await removeFile(row.file_pathname)
    await logAudit({ user, action: 'bill.delete', entityType: 'bill', entityId: id, oldValue: { beneficiary: row.beneficiary, amount: row.amount } })
    revalidatePath(LIST_PATH)
  } catch (error) {
    return failure(error)
  }
  redirect(LIST_PATH)
}

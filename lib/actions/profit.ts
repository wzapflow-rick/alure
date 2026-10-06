'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { query } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { authed, failure, formObject, isoDate, type ActionState } from '@/lib/actions/shared'
import { PROFIT_SETTINGS_KEY, profitSchemaReady } from '@/lib/profit/queries'
import { syncSellerShipping } from '@/lib/profit/shipping'

const PATH = '/lucratividade'
const brNumber = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'))

const adSpendSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    amount: z
      .string()
      .trim()
      .min(1, 'Informe o valor diário')
      .transform(brNumber)
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1_000_000, 'Valor inválido'),
    notes: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.from <= v.to, 'A data final precisa ser depois da inicial')

export async function saveAdSpend(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    if (!(await profitSchemaReady())) return { ok: false, message: 'Rode o db/015 antes de lançar Ads.' }
    const input = adSpendSchema.parse(formObject(fd))
    const days = await query<{ n: string }>(
      `WITH d AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day),
            ml AS (SELECT id FROM marketplaces WHERE code = 'mercado_livre')
       INSERT INTO ad_spend_daily (marketplace_id, spend_date, amount, notes, updated_at)
       SELECT (SELECT id FROM ml), d.day, $3, $4, now() FROM d
       WHERE (SELECT count(*) FROM d) <= 366
       ON CONFLICT (COALESCE(marketplace_id, 0), spend_date)
         DO UPDATE SET amount = EXCLUDED.amount, notes = EXCLUDED.notes, updated_at = now()
       RETURNING 1 AS n`,
      [input.from, input.to, input.amount, input.notes || null],
    )
    if (!days.length) return { ok: false, message: 'Período maior que 1 ano.' }
    await logAudit({
      user,
      action: 'ads.spend',
      entityType: 'ad_spend_daily',
      entityId: `${input.from}..${input.to}`,
      newValue: input,
    })
    revalidatePath(PATH)
    return { ok: true, message: `Investimento lançado em ${days.length} ${days.length === 1 ? 'dia' : 'dias'}.` }
  } catch (error) {
    return failure(error)
  }
}

const taxSchema = z.object({
  taxRatePct: z
    .string()
    .trim()
    .transform((v) => (v === '' ? 0 : brNumber(v)))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 50, 'Alíquota entre 0 e 50%'),
})

export async function saveTaxRate(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await authed()
    const input = taxSchema.parse(formObject(fd))
    await query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [PROFIT_SETTINGS_KEY, JSON.stringify(input), user.id],
    )
    await logAudit({ user, action: 'settings.update', entityType: 'app_settings', entityId: PROFIT_SETTINGS_KEY, newValue: input })
    revalidatePath(PATH)
    return { ok: true, message: 'Alíquota salva.' }
  } catch (error) {
    return failure(error)
  }
}

export async function refreshShipping(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await authed()
    const { from, to } = z.object({ from: isoDate, to: isoDate }).parse(formObject(fd))
    const result = await syncSellerShipping({ from, to })
    revalidatePath(PATH)
    if (result.errors.length && !result.updated) return { ok: false, message: result.errors[0] }
    if (!result.checked) return { ok: true, message: 'Todos os fretes do período já estão lidos.' }
    return {
      ok: true,
      message: `${result.updated} fretes lidos${result.errors.length ? ` · ${result.errors.length} com erro` : ''}.`,
    }
  } catch (error) {
    return failure(error)
  }
}

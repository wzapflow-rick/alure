'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { query, withTransaction } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { recomputeProductCost } from '@/lib/costs'
import { authed, failure, isoDate } from '@/lib/actions/shared'
import { normalizeSku, parseCostSheet, type ParsedCostLine } from '@/lib/cost-import-parse'

export type CostImportMatch = {
  line: number
  sku: string
  unitCost: number
  quantity: number
  supplier: string | null
  products: { id: number; sku: string; name: string }[]
}

export type CostImportResult = {
  ok: boolean
  message?: string
  applied?: boolean
  matches?: CostImportMatch[]
  unmatched?: ParsedCostLine[]
  invalid?: { line: number; raw: string; reason: string }[]
} | null

const inputSchema = z.object({
  data: z.string().max(2_000_000).refine((v) => v.trim().length > 0, 'Cole as linhas da planilha.'),
  effectiveDate: isoDate,
  mode: z.enum(['preview', 'apply']),
  replace: z.string().optional().transform((v) => v === 'on'),
})

export async function importCosts(_: CostImportResult, formData: FormData): Promise<CostImportResult> {
  try {
    const user = await authed()
    const input = inputSchema.parse({
      data: formData.get('data') ?? '',
      effectiveDate: formData.get('effectiveDate') ?? '',
      mode: formData.get('mode') ?? 'preview',
      replace: formData.get('replace') ?? undefined,
    })

    const { lines, invalid } = parseCostSheet(input.data)
    const products = await query<{ id: string; sku: string; name: string }>(
      'SELECT id, sku, name FROM products',
    )
    const bySku = new Map<string, { id: number; sku: string; name: string }[]>()
    for (const p of products) {
      const key = normalizeSku(p.sku)
      const list = bySku.get(key) ?? []
      list.push({ id: Number(p.id), sku: p.sku, name: p.name })
      bySku.set(key, list)
    }

    const latestBySku = new Map<string, ParsedCostLine>()
    for (const l of lines) latestBySku.set(normalizeSku(l.sku), l)

    const matches: CostImportMatch[] = []
    const unmatched: ParsedCostLine[] = []
    for (const [key, l] of latestBySku) {
      const found = bySku.get(key)
      if (found?.length) matches.push({ ...l, products: found })
      else unmatched.push(l)
    }

    if (input.mode === 'preview' || matches.length === 0) {
      return {
        ok: matches.length > 0,
        applied: false,
        message: matches.length
          ? `${matches.length} SKUs encontrados (${matches.reduce((s, m) => s + m.products.length, 0)} produtos). Confira e clique em Aplicar.`
          : 'Nenhum SKU da planilha foi encontrado no catálogo.',
        matches,
        unmatched,
        invalid,
      }
    }

    let updated = 0
    await withTransaction(async (client) => {
      for (const m of matches) {
        for (const p of m.products) {
          if (input.replace) {
            await client.query('UPDATE product_cost_history SET active = false WHERE product_id = $1 AND active', [p.id])
          }
          await client.query(
            `INSERT INTO product_cost_history (product_id, quantity, unit_cost, effective_date, supplier, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,'Importação em massa',$6)`,
            [p.id, m.quantity, m.unitCost, input.effectiveDate, m.supplier, user.id],
          )
          await recomputeProductCost(client, p.id)
          updated++
        }
      }
      await logAudit(
        {
          user,
          action: 'cost.bulk_import',
          entityType: 'product_cost_history',
          entityId: 0,
          newValue: { skus: matches.length, products: updated, replace: input.replace, effectiveDate: input.effectiveDate },
        },
        client,
      )
    })

    revalidatePath('/produtos', 'layout')
    return {
      ok: true,
      applied: true,
      message: `Custo atualizado em ${updated} produtos (${matches.length} SKUs).`,
      matches,
      unmatched,
      invalid,
    }
  } catch (e) {
    return failure(e) as CostImportResult
  }
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useState } from 'react'
import { Badge, CLASSIFICATION_LABEL } from '@/components/ui/badges'
import { formatBRL, formatInt } from '@/lib/format'
import type { ProductListRow } from '@/lib/queries'
import { SearchInput, matchesProduct } from '@/components/products/product-search'
import { cn } from '@/lib/utils'

function status(p: ProductListRow) {
  if (!p.active) return { label: 'Inativo', tone: 'neutral' as const }
  if (!p.average_cost) return { label: 'Sem custo', tone: 'attention' as const }
  if (!p.channels) return { label: 'Sem canal', tone: 'attention' as const }
  return { label: 'Ativo', tone: 'positive' as const }
}

export function ProductsTable({
  products,
  initialQuery = '',
  initialMissingCost = false,
}: {
  products: ProductListRow[]
  initialQuery?: string
  initialMissingCost?: boolean
}) {
  const router = useRouter()
  const [term, setTerm] = useState(initialQuery)
  const [onlyMissingCost, setOnlyMissingCost] = useState(initialMissingCost)
  const deferred = useDeferredValue(term)
  const rows = products.filter((p) => matchesProduct(p, deferred) && (!onlyMissingCost || !p.average_cost))
  const missingCost = products.filter((p) => !p.average_cost).length

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-3 md:flex-row md:items-center md:justify-between">
        <SearchInput value={term} onChange={setTerm} className="md:w-80" />
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <input
              type="checkbox"
              checked={onlyMissingCost}
              onChange={(e) => setOnlyMissingCost(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Só sem custo ({missingCost})
          </label>
          <span className="text-xs text-muted-foreground tabular" aria-live="polite">
            {rows.length} de {products.length}
          </span>
        </div>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-2.5 font-normal">Produto</th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">Vendas 30d</th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">Faturamento 30d</th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">
                  <span title="Tarifa real do anúncio no ML por unidade: comissão + taxa fixa + frete pago por vocês">Taxa ML</span>
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">Custo médio</th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">Canais</th>
                <th scope="col" className="px-5 py-2.5 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => {
                const s = status(p)
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/produtos/${p.id}`)}
                    className={cn('cursor-pointer transition-colors duration-150 hover:bg-surface-2/60', !p.active && 'opacity-50')}
                  >
                    <td className="max-w-md px-5 py-3.5">
                      <Link href={`/produtos/${p.id}`} className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono">{p.sku}</span>
                          {p.category ? ` · ${p.category}` : ''} · {CLASSIFICATION_LABEL[p.classification]}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular">{p.orders_30d ? formatInt(p.orders_30d) : '—'}</td>
                    <td className="px-5 py-3.5 text-right tabular">{p.revenue_30d ? formatBRL(p.revenue_30d) : '—'}</td>
                    <td className="px-5 py-3.5 text-right tabular">
                      {p.ml_fee_total ? (
                        <span
                          className="flex flex-col items-end gap-0.5"
                          title={`Preço ${formatBRL(p.ml_price ?? 0)} · comissão ${Number(p.ml_fee_pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · frete ${formatBRL(p.ml_shipping ?? 0)}`}
                        >
                          <span>{formatBRL(p.ml_fee_total)}</span>
                          <span className="text-xs text-muted-foreground">
                            {Number(p.ml_fee_pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                            {Number(p.ml_shipping) > 0 ? ` + frete ${formatBRL(p.ml_shipping ?? 0)}` : ''}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular">
                      {p.average_cost ? (
                        formatBRL(p.average_cost)
                      ) : (
                        <Link href={`/produtos/${p.id}#custo`} onClick={(e) => e.stopPropagation()} className="text-attention hover:underline">
                          Cadastrar
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular text-muted-foreground">{p.channels}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum produto com esse SKU ou nome.</p>
      )}
    </div>
  )
}

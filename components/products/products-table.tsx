'use client'

import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { Badge, CLASSIFICATION_LABEL } from '@/components/ui/badges'
import { formatBRL, formatInt } from '@/lib/format'
import type { ProductListRow } from '@/lib/queries'
import { SearchInput, matchesProduct } from '@/components/products/product-search'

export function ProductsTable({ products, initialQuery = '' }: { products: ProductListRow[]; initialQuery?: string }) {
  const [term, setTerm] = useState(initialQuery)
  const [onlyMissingCost, setOnlyMissingCost] = useState(false)
  const deferred = useDeferredValue(term)
  const rows = products.filter((p) => matchesProduct(p, deferred) && (!onlyMissingCost || !p.average_cost))
  const missingCost = products.filter((p) => !p.average_cost).length

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-3 md:flex-row md:items-center md:justify-between">
        <SearchInput value={term} onChange={setTerm} className="md:w-80" />
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyMissingCost}
              onChange={(e) => setOnlyMissingCost(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Só sem custo ({missingCost})
          </label>
          <span className="font-mono text-[11px] text-muted-foreground tabular" aria-live="polite">
            {rows.length} de {products.length}
          </span>
        </div>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-normal">Produto</th>
                <th scope="col" className="px-5 py-2 font-normal">Classificação</th>
                <th scope="col" className="px-5 py-2 text-right font-normal">Custo médio</th>
                <th scope="col" className="px-5 py-2 text-right font-normal">Canais</th>
                <th scope="col" className="px-5 py-2 text-right font-normal">Receita 30d</th>
                <th scope="col" className="px-5 py-2 text-right font-normal">Pedidos 30d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className={p.active ? 'hover:bg-surface-2' : 'opacity-50 hover:bg-surface-2'}>
                  <td className="px-5 py-3">
                    <Link href={`/produtos/${p.id}`} className="flex flex-col hover:underline">
                      <span>{p.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{p.sku}{p.category ? ` · ${p.category}` : ''}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3"><Badge>{CLASSIFICATION_LABEL[p.classification]}</Badge></td>
                  <td className="px-5 py-3 text-right tabular">
                    {p.average_cost ? (
                      formatBRL(p.average_cost)
                    ) : (
                      <Link href={`/produtos/${p.id}#custo`} className="text-attention hover:underline">Sem custo</Link>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular">{p.channels}</td>
                  <td className="px-5 py-3 text-right tabular">{p.revenue_30d ? formatBRL(p.revenue_30d) : '—'}</td>
                  <td className="px-5 py-3 text-right tabular">{p.orders_30d ? formatInt(p.orders_30d) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum produto com esse SKU ou nome.</p>
      )}
    </div>
  )
}

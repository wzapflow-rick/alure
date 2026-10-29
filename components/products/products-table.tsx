'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, CLASSIFICATION_LABEL } from '@/components/ui/badges'
import { formatBRL, formatInt } from '@/lib/format'
import type { ProductListRow } from '@/lib/queries'
import { SearchInput, matchesProduct } from '@/components/products/product-search'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

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
  const [page, setPage] = useState(0)
  const deferred = useDeferredValue(term)
  const filtered = products.filter((p) => matchesProduct(p, deferred) && (!onlyMissingCost || !p.average_cost))
  const missingCost = products.filter((p) => !p.average_cost).length
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  function updateTerm(value: string) {
    setTerm(value)
    setPage(0)
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between">
        <SearchInput value={term} onChange={updateTerm} className="md:w-80" />
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            aria-pressed={onlyMissingCost}
            onClick={() => {
              setOnlyMissingCost((v) => !v)
              setPage(0)
            }}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors',
              onlyMissingCost
                ? 'border-attention/40 bg-attention/10 text-attention'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            Sem custo
            <span className="tabular opacity-80">{missingCost}</span>
          </button>
          <span className="text-xs text-muted-foreground tabular" aria-live="polite">
            {filtered.length} de {products.length}
          </span>
        </div>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-border md:hidden">
          {rows.map((p) => {
            const s = status(p)
            return (
              <li key={p.id} className={cn(!p.active && 'opacity-50')}>
                <Link href={`/produtos/${p.id}`} className="flex flex-col gap-2.5 px-4 py-3.5 active:bg-surface-2/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium leading-snug text-pretty">{p.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{p.sku}</span>
                        {p.category ? ` · ${p.category}` : ''}
                      </span>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">Vendas 30d</dt>
                      <dd className="tabular">{p.orders_30d ? formatInt(p.orders_30d) : '—'}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">Faturamento</dt>
                      <dd className="tabular">{p.revenue_30d ? formatBRL(p.revenue_30d) : '—'}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">Custo médio</dt>
                      <dd className={cn('tabular', !p.average_cost && 'text-attention')}>
                        {p.average_cost ? formatBRL(p.average_cost) : 'Cadastrar'}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
      {rows.length ? (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-left text-xs text-muted-foreground [&>th]:whitespace-nowrap [&>th]:font-medium">
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
                    <td className="max-w-sm px-5 py-3.5">
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
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {Number(p.ml_fee_pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                            {Number(p.ml_shipping) > 0 ? ` + ${formatBRL(p.ml_shipping ?? 0)} frete` : ''}
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
        <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <p className="text-sm font-medium">Nenhum produto encontrado.</p>
          <p className="text-sm text-muted-foreground">Confira o SKU ou o nome, ou limpe os filtros.</p>
          <button
            type="button"
            onClick={() => {
              updateTerm('')
              setOnlyMissingCost(false)
            }}
            className="h-9 rounded-md border border-border px-3 text-sm transition-colors hover:bg-surface-2"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5"
        >
          <span className="text-xs text-muted-foreground tabular">
            {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Página anterior"
              className="flex size-10 items-center justify-center rounded-md border border-border transition-colors hover:bg-surface-2 disabled:opacity-40 sm:size-9"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="min-w-14 text-center text-xs tabular">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              aria-label="Próxima página"
              className="flex size-10 items-center justify-center rounded-md border border-border transition-colors hover:bg-surface-2 disabled:opacity-40 sm:size-9"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

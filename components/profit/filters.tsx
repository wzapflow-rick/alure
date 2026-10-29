import Link from 'next/link'
import { Search } from 'lucide-react'
import { Field, Input, Select, buttonVariants } from '@/components/ui/primitives'
import type { ProfitFilters } from '@/lib/profit/queries'
import { cn } from '@/lib/utils'

export type Preset = { key: string; label: string; from: string; to: string }

function shift(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function buildPresets(today: string): Preset[] {
  const [y, m] = today.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const prevMonthEnd = shift(monthStart, -1)
  return [
    { key: 'hoje', label: 'Hoje', from: today, to: today },
    { key: 'ontem', label: 'Ontem', from: shift(today, -1), to: shift(today, -1) },
    { key: '7d', label: 'Últimos 7 dias', from: shift(today, -6), to: today },
    { key: '30d', label: 'Últimos 30 dias', from: shift(today, -29), to: today },
    { key: 'mes', label: 'Este mês', from: monthStart, to: today },
    { key: 'mes-passado', label: 'Mês passado', from: `${prevMonthEnd.slice(0, 7)}-01`, to: prevMonthEnd },
    { key: 'ano', label: 'Este ano', from: `${y}-01-01`, to: today },
  ]
}

const qs = (params: Record<string, string>) =>
  `/lucratividade?${new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()}`

/** 48px touch targets on phones, compact again from `sm` where a pointer is likely. */
const touch = 'h-12 text-base sm:h-9 sm:text-sm'

export function ProfitFiltersBar({ filters, presets }: { filters: ProfitFilters; presets: Preset[] }) {
  const status = filters.status === 'valid' ? '' : filters.status
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(6_22_40/0.05)] sm:p-5">
      <nav aria-label="Períodos">
        <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
          {presets.map((p) => {
            const active = p.from === filters.from && p.to === filters.to
            return (
              <li key={p.key} className="min-w-0 last:col-span-2 sm:last:col-span-1">
                <Link
                  href={qs({ de: p.from, ate: p.to, q: filters.q, status }) as never}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex h-12 w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors sm:h-8 sm:w-auto sm:rounded-full sm:text-[13px]',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <span className="truncate">{p.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <form
        action="/lucratividade"
        className="grid grid-cols-1 gap-3 border-t border-border pt-4 min-[400px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto] lg:items-end"
      >
        <Field label="Data inicial" htmlFor="de">
          <Input id="de" name="de" type="date" defaultValue={filters.from} required className={touch} />
        </Field>
        <Field label="Data final" htmlFor="ate">
          <Input id="ate" name="ate" type="date" defaultValue={filters.to} required className={touch} />
        </Field>
        <Field label="Pesquisar" htmlFor="q" className="min-[400px]:col-span-2 lg:col-span-1">
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="SKU, MLB, título ou nº do pedido"
            className={touch}
          />
        </Field>
        <Field label="Status da venda" htmlFor="status" className="min-[400px]:col-span-2 sm:col-span-1 lg:col-span-1">
          <Select id="status" name="status" defaultValue={filters.status} className={touch}>
            <option value="valid">Válidas</option>
            <option value="cancelled">Canceladas</option>
            <option value="all">Todas</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2 min-[400px]:col-span-2 sm:col-span-1 lg:col-span-1">
          <button
            type="submit"
            className={buttonVariants({ variant: 'primary', className: 'h-12 flex-1 text-base sm:h-9 sm:text-sm lg:flex-none' })}
          >
            <Search className="size-4" aria-hidden />
            Filtrar
          </button>
          <Link href="/lucratividade" className={buttonVariants({ variant: 'ghost', className: 'h-12 sm:h-9' })}>
            Limpar
          </Link>
        </div>
      </form>
    </div>
  )
}

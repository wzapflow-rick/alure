import Link from 'next/link'
import { Search } from 'lucide-react'
import { Chips } from '@/components/ui/tab-nav'
import { Field, Input, Select, buttonVariants } from '@/components/ui/primitives'
import type { ProfitFilters } from '@/lib/profit/queries'

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

export function ProfitFiltersBar({ filters, presets }: { filters: ProfitFilters; presets: Preset[] }) {
  const status = filters.status === 'valid' ? '' : filters.status
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <Chips
        label="Períodos"
        items={presets.map((p) => ({
          key: p.key,
          label: p.label,
          href: qs({ de: p.from, ate: p.to, q: filters.q, status }) as never,
          active: p.from === filters.from && p.to === filters.to,
        }))}
      />
      <form action="/lucratividade" className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_2fr_1fr_auto] md:items-end">
        <Field label="Data inicial" htmlFor="de">
          <Input id="de" name="de" type="date" defaultValue={filters.from} required />
        </Field>
        <Field label="Data final" htmlFor="ate">
          <Input id="ate" name="ate" type="date" defaultValue={filters.to} required />
        </Field>
        <Field label="Pesquisar" htmlFor="q" className="col-span-2 md:col-span-1">
          <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="SKU, MLB, título ou nº do pedido" />
        </Field>
        <Field label="Status da venda" htmlFor="status" className="col-span-2 md:col-span-1">
          <Select id="status" name="status" defaultValue={filters.status}>
            <option value="valid">Válidas</option>
            <option value="cancelled">Canceladas</option>
            <option value="all">Todas</option>
          </Select>
        </Field>
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <button type="submit" className={buttonVariants({ variant: 'primary', className: 'flex-1 md:flex-none' })}>
            <Search className="size-4" aria-hidden />
            Filtrar
          </button>
          <Link href="/lucratividade" className={buttonVariants({ variant: 'ghost' })}>
            Limpar
          </Link>
        </div>
      </form>
    </div>
  )
}

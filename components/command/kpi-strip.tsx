import { Target } from 'lucide-react'
import { formatBRL, formatInt, formatPct } from '@/lib/format'

type Kpis = { hasData: boolean; revenue: number; orders: number; aov: number | null }

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-surface px-4 py-3.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold leading-none tracking-tight tabular break-words md:text-2xl">{value}</span>
    </div>
  )
}

export function KpiStrip({ kpis, dailyTarget }: { kpis: Kpis; dailyTarget: number }) {
  const ratio = dailyTarget > 0 ? (kpis.revenue / dailyTarget) * 100 : 0
  const progress = Math.min(100, ratio)
  const reached = ratio >= 100
  const missing = Math.max(0, dailyTarget - kpis.revenue)

  return (
    <section
      aria-label="Como estamos hoje"
      className="sidebar-dark relative overflow-hidden rounded-2xl p-5 md:p-8"
    >
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">Faturamento hoje</span>
            <span className="text-[40px] font-semibold leading-none tracking-tight tabular break-words sm:text-5xl md:text-6xl">
              {kpis.hasData ? formatBRL(kpis.revenue) : '—'}
            </span>
            {!kpis.hasData ? <span className="text-sm text-muted-foreground">Sem vendas sincronizadas hoje.</span> : null}
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm tabular">
              <span className="flex items-center gap-1.5 font-medium">
                <Target className="size-4 text-primary" aria-hidden />
                {dailyTarget > 0 ? `${formatPct(ratio)} da meta` : 'Meta não definida'}
              </span>
              {dailyTarget > 0 ? (
                <span className="text-muted-foreground">
                  {reached ? `Meta de ${formatBRL(dailyTarget)} batida` : `Faltam ${formatBRL(missing)} de ${formatBRL(dailyTarget)}`}
                </span>
              ) : null}
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso da meta diária"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${reached ? 'bg-positive' : 'bg-primary'}`}
                style={{ width: `${Math.max(progress, kpis.revenue > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:w-64 lg:grid-cols-1">
          <SideStat label="Pedidos" value={kpis.hasData ? formatInt(kpis.orders) : '—'} />
          <SideStat label="Ticket médio" value={kpis.aov !== null ? formatBRL(kpis.aov) : '—'} />
        </div>
      </div>
    </section>
  )
}

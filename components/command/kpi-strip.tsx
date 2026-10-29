import { formatBRL, formatInt, formatPct } from '@/lib/format'

type Kpis = { hasData: boolean; revenue: number; orders: number; aov: number | null }

function Kpi({ label, children, lead }: { label: string; children: React.ReactNode; lead?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${lead ? 'col-span-2 md:col-span-1' : ''}`}>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span
        className={`truncate font-semibold leading-none tracking-tight tabular ${lead ? 'text-[38px] md:text-[40px]' : 'text-[26px] md:text-[40px]'}`}
      >
        {children}
      </span>
    </div>
  )
}

export function KpiStrip({ kpis, dailyTarget }: { kpis: Kpis; dailyTarget: number }) {
  const ratio = dailyTarget > 0 ? (kpis.revenue / dailyTarget) * 100 : 0
  const progress = Math.min(100, ratio)
  const reached = ratio >= 100

  return (
    <section
      aria-label="Como estamos"
      className="grid grid-cols-2 gap-x-6 gap-y-7 rounded-xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(6_22_40/0.05)] md:grid-cols-[1.4fr_1fr_1fr_1.4fr] md:gap-x-8 md:p-7"
    >
      <Kpi label="Faturamento hoje" lead>
        {kpis.hasData ? formatBRL(kpis.revenue) : '—'}
      </Kpi>
      <Kpi label="Pedidos">{kpis.hasData ? formatInt(kpis.orders) : '—'}</Kpi>
      <Kpi label="Ticket médio">{kpis.aov !== null ? formatBRL(kpis.aov) : '—'}</Kpi>

      <div className="col-span-2 flex min-w-0 flex-col gap-2 md:col-span-1">
        <span className="text-[13px] font-medium text-muted-foreground tabular">
          {dailyTarget > 0 ? `${formatPct(ratio)} da meta` : 'Meta não definida'}
        </span>
        <span className="flex items-baseline gap-1.5 tabular">
          <span className="text-lg font-medium text-foreground">{kpis.hasData ? formatBRL(kpis.revenue) : '—'}</span>
          <span className="text-sm text-muted-foreground">/ {dailyTarget > 0 ? formatBRL(dailyTarget) : '—'}</span>
        </span>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da meta diária"
        >
          <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${reached ? 'bg-positive' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!kpis.hasData ? <p className="col-span-full text-sm text-muted-foreground">Sem vendas sincronizadas hoje.</p> : null}
    </section>
  )
}

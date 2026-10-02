import { formatBRL, formatInt, formatPct } from '@/lib/format'

type Kpis = { hasData: boolean; revenue: number; orders: number; aov: number | null }

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[32px] font-semibold leading-none tracking-tight tabular md:text-[40px]">{children}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    </div>
  )
}

export function KpiStrip({ kpis, dailyTarget }: { kpis: Kpis; dailyTarget: number }) {
  const ratio = dailyTarget > 0 ? (kpis.revenue / dailyTarget) * 100 : 0
  const progress = Math.min(100, ratio)
  const reached = ratio >= 100

  return (
    <section aria-label="Como estamos" className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
      <Kpi label="Faturamento hoje">{kpis.hasData ? formatBRL(kpis.revenue) : '—'}</Kpi>
      <Kpi label="Pedidos">{kpis.hasData ? formatInt(kpis.orders) : '—'}</Kpi>
      <Kpi label="Ticket médio">{kpis.aov !== null ? formatBRL(kpis.aov) : '—'}</Kpi>

      <div className="flex min-w-0 flex-col gap-2">
        <span className="flex items-baseline gap-1.5 tabular">
          <span className="text-lg font-medium text-foreground">{kpis.hasData ? formatBRL(kpis.revenue) : '—'}</span>
          <span className="text-sm text-muted-foreground">/ {dailyTarget > 0 ? formatBRL(dailyTarget) : '—'}</span>
        </span>
        <div
          className="h-px w-full overflow-hidden bg-border"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da meta diária"
        >
          <div className={`h-full transition-[width] duration-700 ease-out ${reached ? 'bg-positive' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground tabular">
          {dailyTarget > 0 ? `${formatPct(ratio)} da meta` : 'Meta não definida'}
        </span>
      </div>

      {!kpis.hasData ? <p className="col-span-full text-sm text-muted-foreground">Sem vendas sincronizadas hoje.</p> : null}
    </section>
  )
}

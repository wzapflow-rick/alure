import { Section } from '@/components/ui/primitives'
import { formatBRL, formatInt, formatPct } from '@/lib/format'

type Kpis = { hasData: boolean; revenue: number; orders: number; aov: number | null }

function Kpi({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 py-1 md:border-l md:border-border md:pl-6 md:first:border-l-0 md:first:pl-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tight tabular md:text-[34px]">{children}</span>
      {hint ? <div className="text-xs text-muted-foreground tabular">{hint}</div> : null}
    </div>
  )
}

export function KpiStrip({ kpis, dailyTarget }: { kpis: Kpis; dailyTarget: number }) {
  const ratio = dailyTarget > 0 ? (kpis.revenue / dailyTarget) * 100 : 0
  const progress = Math.min(100, ratio)
  const reached = ratio >= 100

  return (
    <Section title="Como estamos?">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 md:gap-0">
        <Kpi label="Faturamento hoje" hint={kpis.hasData ? undefined : 'Sem vendas sincronizadas'}>
          {kpis.hasData ? formatBRL(kpis.revenue) : '—'}
        </Kpi>
        <Kpi label="Pedidos">{kpis.hasData ? formatInt(kpis.orders) : '—'}</Kpi>
        <Kpi label="Ticket médio">{kpis.aov !== null ? formatBRL(kpis.aov) : '—'}</Kpi>
        <Kpi
          label="Meta diária"
          hint={
            <div className="flex flex-col gap-1.5">
              <div
                className="h-1 w-full max-w-40 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progresso da meta diária"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${reached ? 'bg-positive' : 'bg-primary'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span>de {formatBRL(dailyTarget)}</span>
            </div>
          }
        >
          <span className={reached ? 'text-positive' : undefined}>{dailyTarget > 0 ? formatPct(ratio) : '—'}</span>
        </Kpi>
      </div>
    </Section>
  )
}

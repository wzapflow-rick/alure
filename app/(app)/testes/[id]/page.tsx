import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, DECISION_LABEL, EXPERIMENT_STATUS_LABEL, VARIABLE_LABEL, experimentTone } from '@/components/ui/badges'
import { PageHeader, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { DecisionForm } from '@/components/experiments/decision-form'
import { cancelExperiment } from '@/lib/actions/experiments'
import { formatBRL, formatDate, formatDateTime, formatInt, formatPct, formatTestCode, todayISO } from '@/lib/format'
import { getExperiment, getExperimentComparison } from '@/lib/queries'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: `Teste ${formatTestCode(id)}` }
}

function delta(cur: number | null, base: number | null) {
  if (cur === null || base === null || base === 0) return null
  return ((cur - base) / base) * 100
}

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const num = Number(id)
  if (!Number.isInteger(num) || num <= 0) notFound()
  const exp = await getExperiment(num)
  if (!exp) notFound()
  const cmp = await getExperimentComparison(exp)

  const n = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v))
  const base = { orders: n(cmp?.base_orders), revenue: n(cmp?.base_revenue), visits: n(cmp?.base_visits) }
  const test = { orders: n(cmp?.test_orders), revenue: n(cmp?.test_revenue), visits: n(cmp?.test_visits) }
  const conv = (o: number | null, v: number | null) => (o !== null && v ? (o / v) * 100 : null)
  const hasBaseline = Number(cmp?.base_rows ?? 0) > 0
  const hasTest = Number(cmp?.test_rows ?? 0) > 0
  const isOpen = ['planned', 'in_progress', 'ready_for_review'].includes(exp.status)
  const canDecide = exp.status === 'ready_for_review' || (exp.status === 'in_progress' && exp.evaluation_date <= todayISO())

  const metrics = [
    { label: 'Pedidos', base: base.orders, test: test.orders, fmt: formatInt },
    { label: 'Receita', base: base.revenue, test: test.revenue, fmt: formatBRL },
    { label: 'Visitas', base: base.visits, test: test.visits, fmt: formatInt },
    { label: 'Conversão', base: conv(base.orders, base.visits), test: conv(test.orders, test.visits), fmt: (v: unknown) => formatPct(v) },
  ]

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/testes" className="text-xs text-muted-foreground hover:text-foreground">← Testes</Link>
        <PageHeader
          title={`Teste ${formatTestCode(exp.id)} · ${exp.product_name}`}
          description={`${exp.marketplace_name} · ${VARIABLE_LABEL[exp.variable]}: ${exp.previous_value} → ${exp.new_value}`}
          action={
            <div className="flex items-center gap-2">
              <Badge tone={experimentTone(exp.status)}>{EXPERIMENT_STATUS_LABEL[exp.status]}</Badge>
              {isOpen ? <InlineAction action={cancelExperiment} fields={{ id: exp.id }} label="Cancelar" variant="danger" /> : null}
            </div>
          }
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Panel title="Hipótese" className="lg:col-span-2">
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-sm leading-relaxed text-pretty">{exp.hypothesis}</p>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Início</dt><dd className="tabular">{formatDate(exp.start_date)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Avaliação</dt><dd className="tabular">{formatDate(exp.evaluation_date)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Métrica principal</dt><dd>{exp.primary_metric}</dd></div>
            </dl>
            {exp.secondary_metrics.length ? (
              <p className="text-xs text-muted-foreground">Secundárias: {exp.secondary_metrics.join(', ')}</p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Decisão">
          <div className="px-5 py-5">
            {exp.decision ? (
              <div className="flex flex-col gap-2 text-sm leading-relaxed">
                <Badge tone="positive">{DECISION_LABEL[exp.decision]}</Badge>
                <p>{exp.result}</p>
                {exp.decision_notes ? <p className="text-muted-foreground">{exp.decision_notes}</p> : null}
                <p className="font-mono text-[11px] text-muted-foreground">{formatDateTime(exp.decided_at)}</p>
              </div>
            ) : canDecide ? (
              <DecisionForm id={exp.id} suggested={exp.recommended_decision} />
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Em andamento. Não altere outras variáveis deste produto até {formatDate(exp.evaluation_date)}.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={`Antes × depois · ${cmp?.days ?? 0} dias cada`}>
        {!hasTest ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Ainda não há métricas sincronizadas no período do teste.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-normal">Métrica</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Antes</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Durante</th>
                  <th scope="col" className="px-5 py-2 text-right font-normal">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.map((m) => {
                  const d = delta(m.test, m.base)
                  return (
                    <tr key={m.label}>
                      <td className="px-5 py-3">{m.label}</td>
                      <td className="px-5 py-3 text-right tabular text-muted-foreground">{m.base === null ? '—' : m.fmt(m.base)}</td>
                      <td className="px-5 py-3 text-right tabular">{m.test === null ? '—' : m.fmt(m.test)}</td>
                      <td className={`px-5 py-3 text-right font-mono text-xs tabular ${d === null ? 'text-muted-foreground' : d >= 0 ? 'text-positive' : 'text-critical'}`}>
                        {d === null ? '—' : formatPct(d, true)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!hasBaseline ? (
              <p className="border-t border-border px-5 py-3 text-xs text-attention">Sem histórico anterior suficiente — comparação inconclusiva.</p>
            ) : null}
          </div>
        )}
      </Panel>
    </>
  )
}

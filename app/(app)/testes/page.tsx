import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Badge, DECISION_LABEL, EXPERIMENT_STATUS_LABEL, VARIABLE_LABEL, experimentTone } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { formatDate, formatTestCode } from '@/lib/format'
import { listExperiments } from '@/lib/queries'

export const metadata: Metadata = { title: 'Testes' }

export default async function ExperimentsPage() {
  const experiments = await listExperiments()
  const open = experiments.filter((e) => ['planned', 'in_progress', 'ready_for_review'].includes(e.status))
  const closed = experiments.filter((e) => !open.includes(e))

  return (
    <>
      <PageHeader
        title="Testes"
        description="Uma variável por vez, com hipótese, prazo e decisão registrada."
        action={
          <Link href="/testes/novo" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Plus className="size-4" aria-hidden /> Novo teste
          </Link>
        }
      />
      <ExperimentTable title="Abertos" rows={open} empty="Nenhum teste aberto." />
      <ExperimentTable title="Histórico" rows={closed} empty="Nenhum teste concluído." />
    </>
  )
}

function ExperimentTable({
  title,
  rows,
  empty,
}: {
  title: string
  rows: Awaited<ReturnType<typeof listExperiments>>
  empty: string
}) {
  return (
    <Panel title={title}>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-normal">Teste</th>
                <th scope="col" className="px-5 py-2 font-normal">Produto</th>
                <th scope="col" className="px-5 py-2 font-normal">Variável</th>
                <th scope="col" className="px-5 py-2 font-normal">Período</th>
                <th scope="col" className="px-5 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <td className="px-5 py-3 font-mono text-xs">
                    <Link href={`/testes/${e.id}`} className="hover:underline">{formatTestCode(e.id)}</Link>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col">
                      <span>{e.product_name}</span>
                      <span className="text-xs text-muted-foreground">{e.marketplace_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col">
                      <span>{VARIABLE_LABEL[e.variable]}</span>
                      <span className="text-xs text-muted-foreground">{e.previous_value} → {e.new_value}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground tabular">
                    {formatDate(e.start_date)} — {formatDate(e.evaluation_date)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={experimentTone(e.status)}>{EXPERIMENT_STATUS_LABEL[e.status]}</Badge>
                      {e.decision ? <Badge>{DECISION_LABEL[e.decision]}</Badge> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={empty} />
      )}
    </Panel>
  )
}

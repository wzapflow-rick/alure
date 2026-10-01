import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { MemoryForm } from '@/components/memory/memory-form'
import { archiveMemory } from '@/lib/actions/memory'
import { formatDate, formatTestCode, todayISO } from '@/lib/format'
import { listMemory, listProducts } from '@/lib/queries'

export const metadata: Metadata = { title: 'Memória estratégica' }

const KIND_LABEL: Record<string, string> = { decision: 'Decisão', rule: 'Regra', context: 'Contexto' }

export default async function MemoryPage() {
  const [entries, products] = await Promise.all([listMemory({ status: 'active' }), listProducts()])
  return (
    <>
      <PageHeader title="Memória estratégica" description="O que foi decidido, por quê, e o que se esperava. Consultada pelo assistente." />
      <div className="grid gap-8 lg:grid-cols-3">
        <Panel title="Registros" className="lg:col-span-2">
          {entries.length ? (
            <ol className="divide-y divide-border">
              {entries.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono tabular">{formatDate(m.memory_date)}</span>
                    <Badge>{KIND_LABEL[m.kind] ?? m.kind}</Badge>
                    {m.product_name ? (
                      <Link href={`/produtos/${m.product_id}`} className="hover:text-foreground">{m.product_name}</Link>
                    ) : null}
                    {m.experiment_id ? (
                      <Link href={`/testes/${m.experiment_id}`} className="font-mono hover:text-foreground">{formatTestCode(m.experiment_id)}</Link>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-pretty">{m.subject}</p>
                  <p className="text-sm leading-relaxed text-pretty">{m.decision}</p>
                  {m.reason ? <p className="text-sm leading-relaxed text-muted-foreground">Motivo: {m.reason}</p> : null}
                  {m.expected_result ? <p className="text-sm leading-relaxed text-muted-foreground">Esperado: {m.expected_result}</p> : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{m.user_name ?? 'Sistema'}</span>
                    <InlineAction action={archiveMemory} fields={{ id: m.id, status: 'archived' }} label="Arquivar" />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nenhum registro ainda." description="Decisões de testes são adicionadas aqui automaticamente." />
          )}
        </Panel>
        <Panel title="Novo registro">
          <div className="px-5 py-5">
            <MemoryForm today={todayISO()} products={products.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        </Panel>
      </div>
    </>
  )
}

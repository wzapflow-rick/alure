import type { Metadata } from 'next'
import { PageHeader, Panel } from '@/components/ui/primitives'
import { ExperimentForm } from '@/components/experiments/experiment-form'
import { query } from '@/lib/db'
import { formatBRL, todayISO } from '@/lib/format'

export const metadata: Metadata = { title: 'Novo teste' }

export default async function NewExperimentPage({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const { canal } = await searchParams
  const rows = await query<{ id: string; product_name: string; sku: string; marketplace_name: string; current_price: string }>(
    `SELECT pc.id, p.name AS product_name, p.sku, m.name AS marketplace_name, pc.current_price
       FROM product_channels pc JOIN products p ON p.id = pc.product_id JOIN marketplaces m ON m.id = pc.marketplace_id
      WHERE p.active AND pc.status = 'active' ORDER BY p.name, m.id`,
  )
  const channels = rows.map((r) => ({
    id: r.id,
    price: r.current_price,
    label: `${r.product_name} (${r.sku}) · ${r.marketplace_name} · ${formatBRL(r.current_price)}`,
  }))

  return (
    <>
      <PageHeader title="Novo teste" description="Registre a mudança antes de aplicá-la no marketplace." />
      <Panel>
        <div className="px-5 py-6">
          {channels.length ? (
            <ExperimentForm channels={channels} today={todayISO()} defaultChannel={canal} />
          ) : (
            <p className="text-sm text-muted-foreground">Cadastre um produto com pelo menos um canal ativo primeiro.</p>
          )}
        </div>
      </Panel>
    </>
  )
}

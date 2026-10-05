import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { BroadcastNav } from '@/components/broadcast/broadcast-nav'
import { broadcastSchemaReady } from '@/lib/broadcast/queries'

export default async function BroadcastLayout({ children }: { children: React.ReactNode }) {
  const ready = await broadcastSchemaReady().catch(() => false)
  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Disparos"
        description="Envio do catálogo pelo WhatsApp com ritmo humano, limites e paradas automáticas para proteger o número."
      />
      <BroadcastNav />
      {ready ? (
        children
      ) : (
        <Panel>
          <EmptyState title="Tabelas de disparos ainda não criadas." description="Rode o script db/013_disparos.sql no pgAdmin e recarregue a página." />
        </Panel>
      )}
    </>
  )
}

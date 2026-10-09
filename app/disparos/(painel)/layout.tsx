import { EmptyState, Panel } from '@/components/ui/primitives'
import { BroadcastNav } from '@/components/broadcast/broadcast-nav'
import { DspHeader } from '@/components/dsp/header'
import { broadcastSchemaReady } from '@/lib/broadcast/queries'
import { requireDspUser } from '@/lib/dsp/session'
import { listCompanies } from '@/lib/dsp/companies'

export const dynamic = 'force-dynamic'

export default async function DisparosLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDspUser()
  const [ready, companies] = await Promise.all([
    broadcastSchemaReady().catch(() => false),
    user.role === 'admin' ? listCompanies() : Promise.resolve([]),
  ])
  return (
    <div className="flex min-h-dvh flex-col">
      <DspHeader user={user} companies={companies} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-12 md:py-10">
        <div className="mx-auto flex max-w-5xl animate-rise flex-col gap-8">
          <BroadcastNav admin={user.role === 'admin'} />
          {ready ? (
            children
          ) : (
            <Panel>
              <EmptyState title="Tabelas de disparos ainda não criadas." description="Rode o script db/021_disparos_multiempresa.sql no pgAdmin e recarregue a página." />
            </Panel>
          )}
        </div>
      </main>
    </div>
  )
}

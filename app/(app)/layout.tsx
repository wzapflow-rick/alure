import { getDbStatus, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { Sidebar } from '@/components/shell/sidebar'
import { SetupRequired } from '@/components/shell/setup-required'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const status = await getDbStatus()
  if (status !== 'ready') return <SetupRequired status={status} />

  const user = await requireUser()
  const alerts = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM alerts WHERE status = 'open' AND severity IN ('critical','attention')`,
  )

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar userName={user.name || user.email} openAlerts={alerts?.n ?? 0} />
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">{children}</div>
      </main>
    </div>
  )
}

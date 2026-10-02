import { getDbStatus, isDbConfigured, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { Sidebar } from '@/components/shell/sidebar'
import { SetupRequired } from '@/components/shell/setup-required'
import { CommandPalette } from '@/components/shell/command-palette'
import { listProductIndex } from '@/lib/queries'

export const dynamic = 'force-dynamic'

async function countOpenAlerts() {
  try {
    const row = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM alerts WHERE status = 'open' AND severity IN ('critical','attention')`,
    )
    return { ok: true as const, n: row?.n ?? 0 }
  } catch {
    return { ok: false as const, n: 0 }
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isDbConfigured()) return <SetupRequired status="missing_env" />

  const [user, alerts] = await Promise.all([requireUser(), countOpenAlerts()])

  if (!alerts.ok) {
    const status = await getDbStatus()
    if (status !== 'ready') return <SetupRequired status={status} />
  }

  const products = await listProductIndex().catch(() => [])

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar userName={user.name || user.email} openAlerts={alerts.n} />
      <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-14 lg:px-16">
        <div className="mx-auto flex max-w-5xl animate-rise flex-col gap-12">{children}</div>
      </main>
      <CommandPalette products={products} />
    </div>
  )
}

import { LogOut, Send } from 'lucide-react'
import { logoutDsp } from '@/lib/actions/dsp-auth'
import type { DspUser } from '@/lib/dsp/session'
import type { CompanyRow } from '@/lib/dsp/companies'
import { CompanySwitcher } from '@/components/dsp/company-switcher'

export function DspHeader({ user, companies }: { user: DspUser; companies: CompanyRow[] }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 md:px-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden>
            <Send className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold leading-tight">Disparos</span>
            {user.role === 'admin' && companies.length > 1 ? (
              <CompanySwitcher companies={companies.map((c) => ({ id: c.id, name: c.name }))} current={user.companyId} />
            ) : (
              <span className="truncate text-xs text-muted-foreground">{user.companyName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
          <form action={logoutDsp}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="size-3.5" aria-hidden /> Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}

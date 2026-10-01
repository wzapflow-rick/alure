'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  BookMarked,
  Compass,
  FlaskConical,
  LayoutGrid,
  LogOut,
  Package,
  ScrollText,
  Settings,
  Sparkles,
  Target,
} from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Comando', icon: LayoutGrid },
  { href: '/prioridades', label: 'Prioridades', icon: Target },
  { href: '/oportunidades', label: 'Oportunidades', icon: Compass },
  { href: '/testes', label: 'Testes', icon: FlaskConical },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/leituras', label: 'Leituras', icon: ScrollText },
  { href: '/memoria', label: 'Memória', icon: BookMarked },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/assistente', label: 'Assistente', icon: Sparkles },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Sidebar({ userName, openAlerts }: { userName: string; openAlerts: number }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/entrar')
    router.refresh()
  }

  return (
    <aside className="sticky top-0 z-20 flex w-full shrink-0 flex-col border-b border-border bg-background md:h-dvh md:w-56 md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-5 py-4 md:py-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-[0.3em]">ALURE</span>
          <span className="font-mono text-[10px] text-primary">OS</span>
        </Link>
      </div>

      <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4', active && 'text-primary')} aria-hidden />
              <span>{label}</span>
              {href === '/alertas' && openAlerts > 0 ? (
                <span className="ml-auto rounded bg-attention/15 px-1.5 font-mono text-[10px] text-attention tabular">{openAlerts}</span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="hidden items-center justify-between gap-2 border-t border-border px-5 py-4 md:flex">
        <span className="truncate text-xs text-muted-foreground">{userName}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Sair"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  )
}

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
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { SearchTrigger } from '@/components/shell/command-palette'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: LucideIcon }

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Comando', items: [{ href: '/', label: 'Comando', icon: LayoutGrid }] },
  {
    label: 'Decisão',
    items: [
      { href: '/prioridades', label: 'Prioridades', icon: Target },
      { href: '/oportunidades', label: 'Oportunidades', icon: Compass },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/produtos', label: 'Produtos', icon: Package },
      { href: '/testes', label: 'Testes', icon: FlaskConical },
      { href: '/alertas', label: 'Alertas', icon: Bell },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { href: '/leituras', label: 'Leituras', icon: ScrollText },
      { href: '/memoria', label: 'Memória', icon: BookMarked },
      { href: '/assistente', label: 'Assistente', icon: Sparkles },
    ],
  },
]

const SETTINGS: NavItem = { href: '/configuracoes', label: 'Configurações', icon: Settings }

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function NavLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge?: number }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150',
        active ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface hover:text-foreground',
      )}
    >
      <Icon className={cn('size-[15px] shrink-0', active ? 'text-primary' : 'text-muted-foreground/70')} aria-hidden />
      <span>{item.label}</span>
      {badge ? <span className="ml-auto text-[11px] text-attention tabular">{badge}</span> : null}
    </Link>
  )
}

export function Sidebar({ userName, openAlerts }: { userName: string; openAlerts: number }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push('/entrar')
    router.refresh()
  }

  return (
    <aside className="sticky top-0 z-20 flex w-full shrink-0 flex-col bg-background/95 backdrop-blur md:h-dvh md:w-56 md:border-r md:border-border">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 md:pt-6 md:pb-5">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold tracking-[0.3em]">ALURE</span>
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground">OS</span>
        </Link>
        <SearchTrigger compact className="md:hidden" />
      </div>

      <div className="hidden px-3 pb-5 md:block">
        <SearchTrigger compact className="w-full" />
      </div>

      <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-5 md:overflow-visible md:pb-0">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex gap-1 md:flex-col md:gap-px">
            {group.label !== 'Comando' ? (
              <span className="hidden px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/55 md:block">
                {group.label}
              </span>
            ) : null}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === '/alertas' ? openAlerts : undefined} />
            ))}
          </div>
        ))}

        <div className="flex md:mt-auto md:flex-col md:pb-2">
          <NavLink item={SETTINGS} pathname={pathname} />
        </div>
      </nav>

      <div className="hidden items-center justify-between gap-2 px-5 py-4 md:flex">
        <span className="truncate text-xs text-muted-foreground">{userName}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Sair"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  )
}

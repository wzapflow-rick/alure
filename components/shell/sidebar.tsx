'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell,
  Store,
  BookMarked,
  Compass,
  FlaskConical,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Send,
  Settings,
  Sparkles,
  Target,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { SearchTrigger } from '@/components/shell/command-palette'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: LucideIcon }

const GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: '/', label: 'Comando', icon: LayoutGrid }] },
  {
    label: 'Decisão',
    items: [
      { href: '/prioridades', label: 'Prioridades', icon: Target },
      { href: '/oportunidades', label: 'Oportunidades', icon: Compass },
      { href: '/lucratividade', label: 'Lucratividade', icon: Wallet },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/produtos', label: 'Produtos', icon: Package },
      { href: '/testes', label: 'Testes', icon: FlaskConical },
      { href: '/alertas', label: 'Alertas', icon: Bell },
      { href: '/venda-direta', label: 'Venda direta', icon: Store },
      { href: '/disparos', label: 'Disparos', icon: Send },
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
const ALL_ITEMS = [...GROUPS.flatMap((g) => g.items), SETTINGS]

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
        'flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 md:h-8 md:gap-2.5 md:px-2.5 md:text-[13px]',
        active ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface hover:text-foreground',
      )}
    >
      <Icon className={cn('size-4 shrink-0 md:size-[15px]', active ? 'text-primary' : 'text-muted-foreground/70')} aria-hidden />
      <span>{item.label}</span>
      {badge ? <span className="ml-auto text-xs text-attention tabular">{badge}</span> : null}
    </Link>
  )
}

function NavGroups({ pathname, openAlerts }: { pathname: string; openAlerts: number }) {
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label ?? 'root'} className="flex flex-col gap-px">
          {group.label ? (
            <span className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/55 md:px-2.5">
              {group.label}
            </span>
          ) : null}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === '/alertas' ? openAlerts : undefined} />
          ))}
        </div>
      ))}
    </>
  )
}

function Brand() {
  return (
    <Link href="/" className="flex items-baseline gap-1.5">
      <span className="text-[13px] font-semibold tracking-[0.3em]">ALURE</span>
      <span className="text-[10px] font-medium tracking-widest text-muted-foreground">OS</span>
    </Link>
  )
}

export function Sidebar({ userName, openAlerts }: { userName: string; openAlerts: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const current = ALL_ITEMS.find((item) => isActive(pathname, item.href))

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleSignOut() {
    await signOut()
    router.push('/entrar')
    router.refresh()
  }

  const account = (
    <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
      <span className="truncate text-xs text-muted-foreground">{userName}</span>
      <button
        type="button"
        onClick={handleSignOut}
        className="flex items-center gap-1.5 rounded p-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden />
        <span className="md:sr-only">Sair</span>
      </button>
    </div>
  )

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-ml-1.5 flex size-9 items-center justify-center rounded-md text-foreground hover:bg-surface-2"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Brand />
        {current && current.href !== '/' ? (
          <span className="truncate text-sm text-muted-foreground">
            <span aria-hidden className="mr-2 text-border">
              /
            </span>
            {current.label}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {openAlerts ? (
            <Link
              href="/alertas"
              prefetch={false}
              aria-label={`${openAlerts} alertas abertos`}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-attention tabular hover:bg-surface-2"
            >
              <Bell className="size-4" aria-hidden />
              {openAlerts}
            </Link>
          ) : null}
          <SearchTrigger compact />
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute inset-0 animate-fade bg-background/70 backdrop-blur-sm" />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs animate-rise flex-col border-r border-border bg-background">
            <div className="flex h-14 items-center justify-between px-5">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="-mr-1.5 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Principal" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
              <NavGroups pathname={pathname} openAlerts={openAlerts} />
              <div className="mt-auto pb-2">
                <NavLink item={SETTINGS} pathname={pathname} />
              </div>
            </nav>
            {account}
          </div>
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="px-5 pt-6 pb-5">
          <Brand />
        </div>
        <div className="px-3 pb-5">
          <SearchTrigger compact className="w-full" />
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3">
          <NavGroups pathname={pathname} openAlerts={openAlerts} />
          <div className="mt-auto pb-2">
            <NavLink item={SETTINGS} pathname={pathname} />
          </div>
        </nav>
        {account}
      </aside>
    </>
  )
}

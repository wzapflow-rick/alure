'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/disparos', label: 'Painel' },
  { href: '/disparos/contatos', label: 'Contatos' },
  { href: '/disparos/protecoes', label: 'Proteções' },
]

export function BroadcastNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Disparos" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active =
          tab.href === '/disparos'
            ? pathname === '/disparos' || /^\/disparos\/(\d+|nova)/.test(pathname)
            : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 pb-2.5 text-sm transition-colors',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

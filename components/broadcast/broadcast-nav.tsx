'use client'

import { usePathname } from 'next/navigation'
import { TabNav } from '@/components/ui/tab-nav'

const TABS = [
  { href: '/disparos', label: 'Painel' },
  { href: '/disparos/prospeccao', label: 'Prospecção' },
  { href: '/disparos/contatos', label: 'Contatos' },
  { href: '/disparos/protecoes', label: 'Proteções' },
]

export function BroadcastNav() {
  const pathname = usePathname()
  return (
    <TabNav
      label="Disparos"
      tabs={TABS.map((tab) => ({
        ...tab,
        active:
          tab.href === '/disparos'
            ? pathname === '/disparos' || /^\/disparos\/(\d+|nova)/.test(pathname)
            : pathname.startsWith(tab.href),
      }))}
    />
  )
}

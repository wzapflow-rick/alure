'use client'

import { usePathname } from 'next/navigation'
import { TabNav } from '@/components/ui/tab-nav'

const TABS = [
  { href: '/disparos', label: 'Painel' },
  { href: '/disparos/prospeccao', label: 'Prospecção' },
  { href: '/disparos/contatos', label: 'Contatos' },
  { href: '/disparos/numeros', label: 'Números' },
  { href: '/disparos/protecoes', label: 'Proteções' },
]

export function BroadcastNav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname()
  const tabs = admin ? [...TABS, { href: '/disparos/admin', label: 'Admin' }] : TABS
  return (
    <TabNav
      label="Disparos"
      tabs={tabs.map((tab) => ({
        ...tab,
        active:
          tab.href === '/disparos'
            ? pathname === '/disparos' || /^\/disparos\/(\d+|nova)/.test(pathname)
            : pathname.startsWith(tab.href),
      }))}
    />
  )
}

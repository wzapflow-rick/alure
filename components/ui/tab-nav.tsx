import Link from 'next/link'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Href = ComponentProps<typeof Link>['href']

/** Underlined section tabs. Scrolls sideways on narrow screens instead of wrapping. */
export function TabNav({ label, tabs }: { label: string; tabs: { href: Href; label: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-sm transition-colors',
              tab.active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

/** Compact pill filters. Single scrolling row on mobile, wraps on larger screens. */
export function Chips({
  label,
  items,
}: {
  label: string
  items: { key: string; href: Href; label: React.ReactNode; active: boolean; count?: number }[]
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0 [scrollbar-width:none]">
      <div className="flex gap-1.5 sm:flex-wrap">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? 'true' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
              item.active
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined ? <span className="text-xs tabular opacity-70">{item.count}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  )
}

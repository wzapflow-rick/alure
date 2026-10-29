import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type PanelTone = 'attention' | 'primary' | 'neutral'

const ICON_TONE: Record<PanelTone, string> = {
  attention: 'bg-attention/10 text-attention',
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-surface-2 text-muted-foreground',
}

export function PanelCard({
  label,
  icon,
  count,
  countSuffix,
  tone = 'neutral',
  href,
  linkLabel = 'Ver todas',
  className,
  children,
}: {
  label: string
  icon: React.ReactNode
  count?: number
  countSuffix?: string
  tone?: PanelTone
  href?: string
  linkLabel?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className={cn('flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 md:p-6', className)}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', ICON_TONE[tone])} aria-hidden>
            {icon}
          </span>
          <h2 className="text-sm font-semibold">{label}</h2>
          {count !== undefined ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular text-muted-foreground">
              {count}
              {countSuffix ? ` ${countSuffix}` : null}
            </span>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            {linkLabel}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  )
}

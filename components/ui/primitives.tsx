import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-border bg-surface-2 text-foreground hover:border-muted-foreground/30 hover:bg-surface-2/70',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        danger: 'border border-critical/40 text-critical hover:bg-critical/10',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

const fieldBase =
  'w-full rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 hover:border-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, 'h-9', className)} {...props} />
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground/70">{hint}</p> : null}
    </div>
  )
}

export function Panel({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/** Unboxed section with a quiet uppercase label — the default container on decision screens. */
export function Section({
  title,
  meta,
  action,
  children,
  className,
  id,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} aria-label={typeof title === 'string' ? title : undefined} className={cn('flex flex-col gap-4 scroll-mt-6', className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 className="eyebrow">{title}</h2>
          {meta ? <span className="text-xs text-muted-foreground/80">{meta}</span> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Level-3 information: collapsed by default, expands in place. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
  bodyClassName,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  bodyClassName?: string
}) {
  return (
    <details className={cn('group/disclosure', className)} open={defaultOpen}>
      <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <ChevronRight className="size-3.5 transition-transform duration-200 group-open/disclosure:rotate-90" aria-hidden />
        {summary}
      </summary>
      <div className={cn('animate-fade pt-4', bodyClassName)}>{children}</div>
    </details>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone,
  size = 'md',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'critical' | 'attention' | 'positive'
  size?: 'md' | 'lg'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-semibold tracking-tight tabular',
          size === 'lg' ? 'text-3xl' : 'text-xl',
          tone === 'critical' && 'text-critical',
          tone === 'attention' && 'text-attention',
          tone === 'positive' && 'text-positive',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground tabular">{hint}</span> : null}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-start gap-1 px-4 py-8 sm:px-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      {description ? <p className="max-w-prose text-sm leading-relaxed text-muted-foreground/70">{description}</p> : null}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  eyebrow?: string
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-2">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-[28px]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

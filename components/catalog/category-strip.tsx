'use client'

import Image from 'next/image'
import { ArrowRight, ArrowUpRight, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CategoryCard = { slug: string; label: string; count: number; image: string | null }

export function CategoryStrip({
  categories,
  total,
  active,
  onSelect,
}: {
  categories: CategoryCard[]
  total: number
  active: string | null
  onSelect: (slug: string | null) => void
}) {
  return (
    <section id="categorias" aria-labelledby="categorias-title" className="mx-auto max-w-[1440px] scroll-mt-28 px-5 pt-12 md:px-8 md:pt-16">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-info">Navegue por categoria</p>
          <h2 id="categorias-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
            O que você procura?
          </h2>
        </div>
        <p className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground md:hidden">
          <span className="tabular">{categories.length + 1} categorias</span>
          <ArrowRight className="size-3.5 motion-safe:animate-[nudge_1.6s_ease-in-out_infinite]" aria-hidden />
        </p>
      </div>

      <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -right-5 z-10 w-14 bg-gradient-to-l from-background to-transparent md:hidden"
      />
      <ul className="-mx-5 mt-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto overscroll-x-contain px-5 pb-2 [scrollbar-width:none] md:mx-0 md:mt-6 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-5 [&::-webkit-scrollbar]:hidden">
        <li className="w-[42%] shrink-0 snap-start sm:w-[30%] md:w-auto">
          <CategoryLink
            href="/catalogo#selecao"
            label="Todos os produtos"
            count={total}
            image={null}
            selected={active === null}
            onClick={() => onSelect(null)}
          />
        </li>
        {categories.map((c) => (
          <li key={c.slug} className="w-[42%] shrink-0 snap-start sm:w-[30%] md:w-auto">
            <CategoryLink
              href={`/catalogo?categoria=${c.slug}#selecao`}
              label={c.label}
              count={c.count}
              image={c.image}
              selected={active === c.slug}
              onClick={() => onSelect(active === c.slug ? null : c.slug)}
            />
          </li>
        ))}
      </ul>
      </div>
    </section>
  )
}

function CategoryLink({
  href,
  label,
  count,
  image,
  selected,
  onClick,
}: {
  href: string
  label: string
  count: number
  image: string | null
  selected: boolean
  onClick: () => void
}) {
  return (
    <a
      href={href}
      aria-current={selected ? 'true' : undefined}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/25',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2/60">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1024px) 240px, (min-width: 768px) 22vw, 42vw"
            className="object-contain p-4 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-primary">
            <LayoutGrid className="size-7" strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 border-t border-border/70 px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium leading-snug text-foreground text-pretty md:text-sm">{label}</span>
          <span className="tabular text-xs text-muted-foreground">
            {count} {count === 1 ? 'produto' : 'produtos'}
          </span>
        </div>
        <ArrowUpRight
          className={cn(
            'mt-0.5 size-4 shrink-0 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5',
            selected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
          )}
          aria-hidden
        />
      </div>
    </a>
  )
}

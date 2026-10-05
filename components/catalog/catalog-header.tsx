'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'

const navLink =
  'text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground'

export function CatalogHeader() {
  const { count, setOpen } = useCart()
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 md:h-16 md:px-8">
        <div className="flex items-center gap-10">
          <Link href="/catalogo" className="text-lg font-semibold tracking-[0.32em] text-foreground">
            ALURE
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-8 sm:flex">
            <Link href="/catalogo#produtos" className={navLink}>
              Catálogo
            </Link>
            <Link href="/catalogo#venda-direta" className={navLink}>
              Venda direta
            </Link>
          </nav>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative inline-flex h-10 items-center gap-2 rounded-full bg-primary pl-4 pr-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
          aria-label={`Abrir pedido, ${count} ${count === 1 ? 'unidade' : 'unidades'}`}
        >
          <ShoppingBag className="size-4" aria-hidden />
          <span>Pedido</span>
          <span className="tabular inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary-foreground px-2 text-xs text-primary">
            {count}
          </span>
        </button>
      </div>
    </header>
  )
}

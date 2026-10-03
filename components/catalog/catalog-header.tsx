'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'

export function CatalogHeader() {
  const { count, setOpen } = useCart()
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/catalogo" className="flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-[0.28em] text-foreground">ALURE</span>
          <span className="hidden font-mono text-[11px] uppercase tracking-widest text-muted-foreground sm:inline">
            Catálogo · venda direta
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60"
          aria-label={`Abrir pedido, ${count} ${count === 1 ? 'unidade' : 'unidades'}`}
        >
          <ShoppingBag className="size-4" aria-hidden />
          <span>Pedido</span>
          <span className="tabular min-w-5 rounded-full bg-primary-foreground/15 px-1.5 text-center text-xs">{count}</span>
        </button>
      </div>
    </header>
  )
}

'use client'

import { ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { formatBRL } from '@/lib/format'

export function CartBar() {
  const { count, total, open, setOpen } = useCart()
  if (count === 0 || open) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-full bg-primary pl-5 pr-2 text-primary-foreground"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="size-4" aria-hidden />
          Ver pedido
        </span>
        <span className="tabular flex items-center gap-2 text-sm">
          <span className="opacity-80">{`${count} ${count === 1 ? 'un.' : 'un.'}`}</span>
          <span className="rounded-full bg-primary-foreground px-3 py-1.5 font-semibold text-primary">{formatBRL(total)}</span>
        </span>
      </button>
    </div>
  )
}

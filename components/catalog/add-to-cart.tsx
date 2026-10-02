'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { QuantityStepper } from '@/components/catalog/quantity-stepper'
import type { CatalogItem } from '@/lib/catalog/types'
import { cn } from '@/lib/utils'

export function AddToCart({ item, size = 'md' }: { item: CatalogItem; size?: 'sm' | 'md' }) {
  const { add, lines } = useCart()
  const [qty, setQty] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const inCart = lines.find((l) => l.id === item.id)?.qty ?? 0

  function handleAdd() {
    add(item, qty)
    setQty(1)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1600)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <QuantityStepper value={qty} onChange={setQty} label={`Quantidade de ${item.name}`} size={size} />
        <button
          type="button"
          onClick={handleAdd}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60',
            size === 'sm' ? 'h-8' : 'h-10',
          )}
        >
          {justAdded ? <Check className="size-4" aria-hidden /> : null}
          {justAdded ? 'Adicionado' : 'Adicionar'}
        </button>
      </div>
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {inCart > 0 ? `${inCart} no pedido` : ''}
      </p>
    </div>
  )
}

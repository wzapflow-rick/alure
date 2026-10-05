'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { QuantityStepper } from '@/components/catalog/quantity-stepper'
import { trackCatalog } from '@/lib/catalog/analytics'
import type { CatalogItem } from '@/lib/catalog/types'
import { cn } from '@/lib/utils'

export function AddToCart({
  item,
  size = 'md',
  layout = 'row',
}: {
  item: CatalogItem
  size?: 'sm' | 'md'
  layout?: 'row' | 'stack'
}) {
  const { add, lines } = useCart()
  const [qty, setQty] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const inCart = lines.find((l) => l.id === item.id)?.qty ?? 0
  const stacked = layout === 'stack'

  function handleAdd() {
    add(item, qty)
    trackCatalog('add_to_cart', { sku: item.sku, qty, value: Math.round(item.price * qty * 100) / 100 })
    setQty(1)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1600)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex gap-2', stacked ? 'flex-col' : 'items-center')}>
        <QuantityStepper
          value={qty}
          onChange={setQty}
          label={`Quantidade de ${item.name}`}
          size={stacked ? 'sm' : size}
          fullWidth={stacked}
        />
        <button
          type="button"
          onClick={handleAdd}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60',
            stacked ? 'h-11 w-full' : cn('flex-1', size === 'sm' ? 'h-8' : 'h-11'),
          )}
        >
          {justAdded ? <Check className="size-4 shrink-0" aria-hidden /> : null}
          <span className="truncate">{justAdded ? 'Adicionado' : stacked ? 'Adicionar ao pedido' : 'Adicionar'}</span>
        </button>
      </div>
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {inCart > 0 ? `${inCart} no pedido` : ''}
      </p>
    </div>
  )
}

'use client'

import { Minus, Plus } from 'lucide-react'
import { MAX_QTY_PER_ITEM } from '@/lib/catalog/types'
import { cn } from '@/lib/utils'

export function QuantityStepper({
  value,
  onChange,
  label,
  size = 'md',
}: {
  value: number
  onChange: (qty: number) => void
  label: string
  size?: 'sm' | 'md'
}) {
  const btn = cn(
    'inline-flex items-center justify-center text-foreground transition-colors hover:bg-surface-2 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/50',
    size === 'sm' ? 'size-8' : 'size-10',
  )
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-surface" role="group" aria-label={label}>
      <button type="button" className={cn(btn, 'rounded-l-full')} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Diminuir">
        <Minus className="size-3.5" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_QTY_PER_ITEM}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 1)}
        aria-label="Quantidade"
        className={cn(
          'tabular w-10 appearance-none bg-transparent text-center text-sm font-medium text-foreground focus:outline-none [&::-webkit-inner-spin-button]:appearance-none',
          size === 'sm' ? 'h-8' : 'h-10',
        )}
      />
      <button
        type="button"
        className={cn(btn, 'rounded-r-full')}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QTY_PER_ITEM}
        aria-label="Aumentar"
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

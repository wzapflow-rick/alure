'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'

export type FacetOption = { value: string; label: string; count: number; swatch?: string }

export type FilterPanelProps = {
  categories: FacetOption[]
  brands: FacetOption[]
  finishes: FacetOption[]
  priceBounds: { min: number; max: number } | null
  categoria: string | null
  marcas: string[]
  acabamentos: string[]
  min: number | null
  max: number | null
  onCategory: (slug: string | null) => void
  onToggleBrand: (value: string) => void
  onToggleFinish: (value: string) => void
  onPrice: (min: number | null, max: number | null) => void
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">{title}</legend>
      {children}
    </fieldset>
  )
}

function OptionRow({
  type,
  checked,
  disabled,
  label,
  count,
  swatch,
  onChange,
  name,
}: {
  type: 'radio' | 'checkbox'
  checked: boolean
  disabled?: boolean
  label: string
  count: number
  swatch?: string
  onChange: () => void
  name: string
}) {
  return (
    <label
      className={cn(
        'group flex min-h-9 cursor-pointer items-center gap-3 rounded-md text-sm transition-colors',
        disabled && !checked ? 'cursor-not-allowed opacity-45' : 'hover:text-foreground',
        checked ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled && !checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-info/60',
          type === 'radio' ? 'rounded-full' : 'rounded-[5px]',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25 bg-surface',
        )}
      >
        {checked ? (
          type === 'radio' ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : <Check className="size-3" strokeWidth={3} />
        ) : null}
      </span>
      {swatch ? (
        <span aria-hidden className="size-4 shrink-0 rounded-full ring-1 ring-foreground/15" style={{ background: swatch }} />
      ) : null}
      <span className="flex-1 leading-snug">{label}</span>
      <span className="tabular text-xs text-muted-foreground">{count}</span>
    </label>
  )
}

function PriceRange({
  bounds,
  min,
  max,
  onChange,
}: {
  bounds: { min: number; max: number }
  min: number | null
  max: number | null
  onChange: (min: number | null, max: number | null) => void
}) {
  const lo = Math.floor(bounds.min)
  const hi = Math.ceil(bounds.max)
  const [draft, setDraft] = useState<[number, number]>([min ?? lo, max ?? hi])

  useEffect(() => {
    setDraft([min ?? lo, max ?? hi])
  }, [min, max, lo, hi])

  function commit(next: [number, number]) {
    const a = Math.max(lo, Math.min(next[0], next[1]))
    const b = Math.min(hi, Math.max(next[0], next[1]))
    onChange(a <= lo ? null : a, b >= hi ? null : b)
  }

  const span = Math.max(1, hi - lo)
  const left = ((draft[0] - lo) / span) * 100
  const right = 100 - ((draft[1] - lo) / span) * 100
  const step = span > 2000 ? 50 : span > 400 ? 10 : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="price-range relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${left}%`, right: `${right}%` }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={draft[0]}
          aria-label="Preço mínimo"
          aria-valuetext={formatBRL(draft[0])}
          onChange={(e) => setDraft([Math.min(Number(e.target.value), draft[1]), draft[1]])}
          onPointerUp={() => commit(draft)}
          onKeyUp={() => commit(draft)}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={draft[1]}
          aria-label="Preço máximo"
          aria-valuetext={formatBRL(draft[1])}
          onChange={(e) => setDraft([draft[0], Math.max(Number(e.target.value), draft[0])])}
          onPointerUp={() => commit(draft)}
          onKeyUp={() => commit(draft)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['Mínimo', 'Máximo'] as const).map((label, i) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <div className="flex h-10 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-info/25">
              <span className="text-xs text-muted-foreground">R$</span>
              <input
                type="number"
                inputMode="numeric"
                min={lo}
                max={hi}
                value={draft[i]}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setDraft(i === 0 ? [v, draft[1]] : [draft[0], v])
                }}
                onBlur={() => commit(draft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit(draft)
                }}
                className="tabular w-full min-w-0 bg-transparent text-sm text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

export function FilterPanel(props: FilterPanelProps) {
  const { categories, brands, finishes, priceBounds } = props
  return (
    <div className="flex flex-col gap-5">
      {categories.length > 1 ? (
        <Group title="Categoria">
          <div className="flex flex-col gap-0.5">
            {categories.map((c) => (
              <OptionRow
                key={c.value}
                name="filtro-categoria"
                type="radio"
                checked={props.categoria === c.value}
                disabled={c.count === 0}
                label={c.label}
                count={c.count}
                onChange={() => props.onCategory(props.categoria === c.value ? null : c.value)}
              />
            ))}
          </div>
        </Group>
      ) : null}

      {brands.length > 1 ? (
        <Group title="Marca">
          <div className="flex flex-col gap-0.5">
            {brands.map((b) => (
              <OptionRow
                key={b.value}
                name="filtro-marca"
                type="checkbox"
                checked={props.marcas.includes(b.value)}
                disabled={b.count === 0}
                label={b.label}
                count={b.count}
                onChange={() => props.onToggleBrand(b.value)}
              />
            ))}
          </div>
        </Group>
      ) : null}

      {finishes.length > 0 ? (
        <Group title="Acabamento">
          <div className="flex flex-col gap-0.5">
            {finishes.map((f) => (
              <OptionRow
                key={f.value}
                name="filtro-acabamento"
                type="checkbox"
                checked={props.acabamentos.includes(f.value)}
                disabled={f.count === 0}
                label={f.label}
                count={f.count}
                swatch={f.swatch}
                onChange={() => props.onToggleFinish(f.value)}
              />
            ))}
          </div>
        </Group>
      ) : null}

      {priceBounds && priceBounds.max > priceBounds.min ? (
        <Group title="Faixa de preço">
          <PriceRange bounds={priceBounds} min={props.min} max={props.max} onChange={props.onPrice} />
        </Group>
      ) : null}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { matchesProduct, type SearchableProduct } from '@/components/products/product-search'
import { cn } from '@/lib/utils'

export type PaletteProduct = SearchableProduct & { average_cost: string | null }

const OPEN_EVENT = 'alure:open-palette'
const MAX_RESULTS = 8

const PAGES = [
  { label: 'Comando', href: '/' },
  { label: 'Prioridades', href: '/prioridades' },
  { label: 'Oportunidades', href: '/oportunidades' },
  { label: 'Produtos', href: '/produtos' },
  { label: 'Testes', href: '/testes' },
  { label: 'Alertas', href: '/alertas' },
  { label: 'Leituras', href: '/leituras' },
  { label: 'Memória', href: '/memoria' },
  { label: 'Assistente', href: '/assistente' },
  { label: 'Configurações', href: '/configuracoes' },
]

type Item = { key: string; href: string; primary: string; secondary?: string; tag?: string; mono?: boolean }

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function SearchTrigger({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className={cn(
        'group flex items-center gap-3 rounded-lg bg-surface text-left text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        compact ? 'h-8 px-2.5 text-[13px]' : 'h-11 px-4 text-sm',
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{compact ? 'Buscar' : 'Buscar produto ou SKU'}</span>
      <kbd className="rounded border border-border px-1.5 font-mono text-[11px] text-muted-foreground/80">⌘K</kbd>
    </button>
  )
}

export function CommandPalette({ products }: { products: PaletteProduct[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const deferred = useDeferredValue(term)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setTerm('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const q = deferred.trim()
  const productItems: Item[] = (q ? products.filter((p) => matchesProduct(p, q)) : [])
    .slice(0, MAX_RESULTS)
    .map((p) => ({
      key: `p-${p.id}`,
      href: p.average_cost ? `/produtos/${p.id}` : `/produtos/${p.id}#custo`,
      primary: p.sku,
      secondary: p.name,
      tag: p.average_cost ? undefined : 'Sem custo',
      mono: true,
    }))
  const pageItems: Item[] = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase())).map((p) => ({
    key: `n-${p.href}`,
    href: p.href,
    primary: p.label,
  }))
  const items = [...productItems, ...pageItems]

  function go(item: Item | undefined) {
    if (!item) return
    setOpen(false)
    router.push(item.href)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      go(items[active])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 pt-[14vh] backdrop-blur-sm animate-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-2xl shadow-background">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar produto, SKU ou página"
            aria-label="Buscar produto, SKU ou página"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            autoComplete="off"
            spellCheck={false}
            className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 font-mono text-[11px] text-muted-foreground">Esc</kbd>
        </div>

        <ul id="palette-results" role="listbox" className="max-h-96 overflow-y-auto py-2">
          {productItems.length ? <li className="px-4 pt-1 pb-2 eyebrow">Produtos</li> : null}
          {items.map((item, i) => (
            <li key={item.key} role="option" aria-selected={i === active}>
              {i === productItems.length ? <div className="px-4 pt-3 pb-2 eyebrow">Ir para</div> : null}
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                  i === active ? 'bg-surface-2 text-foreground' : 'text-foreground/85',
                )}
              >
                <span className={cn('shrink-0', item.mono && 'font-mono text-[13px]')}>{item.primary}</span>
                {item.secondary ? <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.secondary}</span> : <span className="flex-1" />}
                {item.tag ? <span className="shrink-0 text-xs text-attention">{item.tag}</span> : null}
                {i === active ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
              </button>
            </li>
          ))}
          {q && !items.length ? <li className="px-4 py-6 text-sm text-muted-foreground">Nada encontrado para “{q}”.</li> : null}
        </ul>
      </div>
    </div>
  )
}

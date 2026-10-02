'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { MAX_QTY_PER_ITEM, type CartLine, type CatalogItem } from '@/lib/catalog/types'

const STORAGE_KEY = 'alure-catalog-cart-v1'

type CartContextValue = {
  lines: CartLine[]
  count: number
  total: number
  open: boolean
  setOpen: (open: boolean) => void
  add: (item: CatalogItem, qty: number) => void
  setQty: (id: number, qty: number) => void
  remove: (id: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function clampQty(qty: number) {
  if (!Number.isFinite(qty)) return 1
  return Math.min(MAX_QTY_PER_ITEM, Math.max(1, Math.round(qty)))
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[]
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && typeof l.id === 'number' && l.qty > 0))
      }
    } catch {
      // A corrupted cart simply starts empty.
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines, hydrated])

  const add = useCallback((item: CatalogItem, qty: number) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === item.id)
      if (existing) return prev.map((l) => (l.id === item.id ? { ...l, qty: clampQty(l.qty + qty), price: item.price } : l))
      return [
        ...prev,
        { id: item.id, sku: item.sku, name: item.name, price: item.price, image: item.images[0] ?? null, qty: clampQty(qty) },
      ]
    })
  }, [])

  const setQty = useCallback((id: number, qty: number) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: clampQty(qty) } : l)))
  }, [])

  const remove = useCallback((id: number) => setLines((prev) => prev.filter((l) => l.id !== id)), [])
  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((s, l) => s + l.qty, 0)
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
    return { lines, count, total, open, setOpen, add, setQty, remove, clear }
  }, [lines, open, add, setQty, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}

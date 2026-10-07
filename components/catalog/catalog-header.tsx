'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle, Search, ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { CatalogSearch } from '@/components/catalog/catalog-search'
import { trackCatalog } from '@/lib/catalog/analytics'
import { catalogWhatsAppNumber, HELP_MESSAGE, whatsAppLink } from '@/lib/catalog/merchandising'
import { cn } from '@/lib/utils'

const navLink =
  'text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground'

function SearchFallback() {
  return (
    <div className="relative h-11 w-full rounded-full border border-border bg-surface" aria-hidden>
      <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export function CatalogHeader() {
  const { count, setOpen } = useCart()
  const pathname = usePathname()
  const onCatalog = pathname === '/catalogo'
  const waNumber = catalogWhatsAppNumber()

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-3 md:px-8 lg:h-[72px] lg:flex-row lg:items-center lg:gap-10 lg:py-0">
        <div className="flex items-center justify-between gap-6 lg:contents">
          <div className="flex items-center gap-10">
            <Link href="/catalogo" className="text-lg font-semibold tracking-[0.32em] text-foreground">
              ALURE
            </Link>
            <nav aria-label="Principal" className="hidden items-center gap-7 xl:flex">
              <Link
                href="/catalogo"
                aria-current={onCatalog ? 'page' : undefined}
                className={cn(navLink, onCatalog && 'text-foreground underline decoration-primary decoration-2 underline-offset-[10px]')}
              >
                Catálogo
              </Link>
              <Link href="/catalogo#categorias" className={navLink}>
                Categorias
              </Link>
              <Link href="/catalogo#venda-direta" className={navLink}>
                Venda direta
              </Link>
              {waNumber ? (
                <a
                  href={whatsAppLink(waNumber, HELP_MESSAGE)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackCatalog('contact_click', { from: 'header' })}
                  className={navLink}
                >
                  Atendimento
                </a>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-2 lg:order-last">
            {waNumber ? (
              <a
                href={whatsAppLink(waNumber, HELP_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackCatalog('contact_click', { from: 'header' })}
                className="inline-flex size-10 items-center justify-center rounded-full text-foreground ring-1 ring-border transition-colors hover:bg-surface xl:hidden"
                aria-label="Atendimento pelo WhatsApp"
              >
                <MessageCircle className="size-4" aria-hidden />
              </a>
            ) : null}
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
        </div>

        <div className="w-full lg:mx-auto lg:max-w-xl lg:flex-1">
          <Suspense fallback={<SearchFallback />}>
            <CatalogSearch />
          </Suspense>
        </div>
      </div>
    </header>
  )
}

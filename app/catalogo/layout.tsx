import type { Metadata, Viewport } from 'next'
import { CartProvider } from '@/components/catalog/cart-provider'
import { CatalogHeader } from '@/components/catalog/catalog-header'
import { CartDrawer } from '@/components/catalog/cart-drawer'

export const metadata: Metadata = {
  title: { default: 'Catálogo ALURE', template: '%s · Catálogo ALURE' },
  description: 'Metais e acabamentos com preço de venda direta. Monte seu pedido e receba o atendimento pelo WhatsApp.',
  openGraph: {
    title: 'Catálogo ALURE · venda direta',
    description: 'Metais e acabamentos com preço de venda direta. Monte seu pedido e receba o atendimento pelo WhatsApp.',
    images: [{ url: '/catalogo/hero.png', width: 1536, height: 864 }],
    locale: 'pt_BR',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#eef0ef',
  colorScheme: 'light',
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="catalog-theme flex min-h-dvh flex-col bg-background text-foreground">
        <CatalogHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
            <span className="font-semibold tracking-[0.28em] text-foreground">ALURE</span>
            <span>Preços de venda direta. Disponibilidade, frete e prazo confirmados no atendimento.</span>
          </div>
        </footer>
      </div>
      <CartDrawer />
    </CartProvider>
  )
}

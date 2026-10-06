import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { CartProvider } from '@/components/catalog/cart-provider'
import { CatalogHeader } from '@/components/catalog/catalog-header'
import { CartDrawer } from '@/components/catalog/cart-drawer'
import { CartBar } from '@/components/catalog/cart-bar'

const description =
  'Metais e acabamentos Deca para seus projetos. Uma seleção ALURE para profissionais, lojas e projetos, com atendimento direto pelo WhatsApp.'

export const metadata: Metadata = {
  title: { default: 'ALURE · Metais e acabamentos Deca', template: '%s · ALURE' },
  description,
  openGraph: {
    title: 'ALURE · Metais e acabamentos Deca',
    description,
    images: [{ url: '/catalogo/hero.png', width: 1536, height: 864 }],
    locale: 'pt_BR',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#f6f4ef',
  colorScheme: 'light',
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="catalog-theme flex min-h-dvh flex-col overflow-x-clip bg-background pb-20 text-foreground md:pb-0">
        <CatalogHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between md:px-8">
            <div className="flex flex-col gap-2">
              <span className="text-lg font-semibold tracking-[0.32em]">ALURE</span>
              <span className="text-sm text-muted-foreground">{'Metais • Acabamentos • Soluções'}</span>
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground md:items-end">
              <span>Compra direta ALURE</span>
              <span>Atendimento pelo WhatsApp</span>
            </div>
          </div>
        </footer>
      </div>
      <CartBar />
      <CartDrawer />
      <Analytics />
    </CartProvider>
  )
}

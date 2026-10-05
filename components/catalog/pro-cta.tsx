'use client'

import { MessageCircle, ShoppingBag } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { trackCatalog } from '@/lib/catalog/analytics'
import { catalogWhatsAppNumber, PRO_CONTACT_MESSAGE, whatsAppLink } from '@/lib/catalog/merchandising'

export function ProCta() {
  const { count, setOpen } = useCart()
  const number = catalogWhatsAppNumber()

  function sendOrder() {
    if (count > 0) {
      setOpen(true)
      return
    }
    document.getElementById('selecao')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="venda-direta" className="scroll-mt-20 px-5 pt-16 md:px-8 md:pt-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 rounded-2xl bg-foreground px-6 py-10 text-background md:flex-row md:items-center md:justify-between md:px-12 md:py-14">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-background/60">
            {'Arquitetos • Lojas • Construtoras'}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            Compra para projeto ou revenda?
          </h2>
          <p className="leading-relaxed text-background/75 text-pretty">
            Fale com a ALURE e receba atendimento direto para sua necessidade.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row md:shrink-0">
          {number ? (
            <a
              href={whatsAppLink(number, PRO_CONTACT_MESSAGE)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackCatalog('contact_click', { placement: 'pro_cta' })}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-background px-7 text-sm font-medium text-foreground transition-opacity hover:opacity-90"
            >
              <MessageCircle className="size-4" aria-hidden />
              Falar com a ALURE
            </a>
          ) : null}
          <button
            type="button"
            onClick={sendOrder}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-medium text-background ring-1 ring-background/40 transition-colors hover:ring-background"
          >
            <ShoppingBag className="size-4" aria-hidden />
            Enviar pedido pelo WhatsApp
          </button>
        </div>
      </div>
    </section>
  )
}

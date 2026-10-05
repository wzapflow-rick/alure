import { MessageCircle } from 'lucide-react'
import { catalogWhatsAppNumber, HELP_MESSAGE, whatsAppLink } from '@/lib/catalog/merchandising'

export function WhatsAppHelp() {
  const number = catalogWhatsAppNumber()

  return (
    <section id="venda-direta" className="scroll-mt-20 border-t border-border bg-surface-2/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-14 md:flex-row md:items-center md:justify-between md:px-8 md:py-20">
        <div className="flex max-w-xl flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-info">Venda direta ALURE</p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">Precisa de ajuda para escolher?</h2>
          <p className="leading-relaxed text-muted-foreground text-pretty">
            Fale com a ALURE pelo WhatsApp. Uma pessoa da nossa equipe responde e ajuda a montar o pedido do seu projeto.
          </p>
        </div>
        {number ? (
          <a
            href={whatsAppLink(number, HELP_MESSAGE)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <MessageCircle className="size-4" aria-hidden />
            Falar no WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  )
}

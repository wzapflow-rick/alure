import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge, type Tone } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { OrderStatusForm } from '@/components/catalog-admin/order-status-form'
import { resendCatalogOrderWhatsapp } from '@/lib/actions/catalog'
import { listOrders } from '@/lib/catalog/queries'
import { formatPhone } from '@/lib/catalog/order-message'
import { formatBRL, formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Pedidos · Venda direta' }

const WHATSAPP: Record<string, { label: string; tone: Tone }> = {
  sent: { label: 'WhatsApp enviado', tone: 'positive' },
  failed: { label: 'WhatsApp falhou', tone: 'critical' },
  pending: { label: 'WhatsApp pendente', tone: 'attention' },
}

export default async function CatalogOrdersPage() {
  const orders = await listOrders()

  return (
    <>
      <Link href="/venda-direta" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Catálogo
      </Link>
      <PageHeader eyebrow="Venda direta" title="Pedidos" description="Pedidos enviados pelo catálogo público, com o status do aviso no WhatsApp." />

      {orders.length === 0 ? (
        <Panel>
          <EmptyState title="Nenhum pedido ainda." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((o) => {
            const wa = WHATSAPP[o.whatsappStatus]
            return (
              <Panel
                key={o.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{o.code}</span>
                    <span className="font-normal text-muted-foreground">{formatDateTime(o.createdAt)}</span>
                  </span>
                }
                action={<Badge tone={wa.tone}>{wa.label}</Badge>}
              >
                <div className="grid gap-5 p-5 md:grid-cols-[260px_1fr]">
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="font-medium">{o.customerName}</p>
                    <a href={`https://wa.me/${o.customerPhone}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
                      {formatPhone(o.customerPhone)}
                    </a>
                    {o.customerCompany ? <p className="text-muted-foreground">{o.customerCompany}</p> : null}
                    {o.customerCity ? <p className="text-muted-foreground">{o.customerCity}</p> : null}
                    {o.notes ? <p className="mt-2 leading-relaxed text-muted-foreground">{o.notes}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <OrderStatusForm id={o.id} status={o.status} />
                      {o.whatsappStatus !== 'sent' ? (
                        <InlineAction action={resendCatalogOrderWhatsapp} fields={{ id: o.id }} label="Reenviar WhatsApp" />
                      ) : null}
                    </div>
                    {o.whatsappError ? <p className="mt-1 text-xs text-critical">{o.whatsappError}</p> : null}
                  </div>
                  <div className="flex flex-col">
                    <ul className="divide-y divide-border text-sm">
                      {o.items.map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-4 py-2">
                          <span className="min-w-0">
                            <span className="tabular font-medium">{l.qty}x</span> {l.name}{' '}
                            <span className="font-mono text-xs text-muted-foreground">{l.sku}</span>
                          </span>
                          <span className="tabular shrink-0">{formatBRL(l.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-baseline justify-between border-t border-border pt-3">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="tabular text-lg font-semibold">{formatBRL(o.total)}</span>
                    </div>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </>
  )
}

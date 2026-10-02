import { Badge } from '@/components/ui/badges'
import { EmptyState, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { CompetitorOfferForm } from '@/components/products/competitor-offer-form'
import { deleteCompetitorOffer } from '@/lib/actions/competition'
import { competitivePressure, PRESSURE_LABEL, type CompetitorOffer, type PressureLevel } from '@/lib/engine/rules'
import { daysBetween, formatBRL, formatDate, formatInt, formatPct } from '@/lib/format'
import type { priceChannel } from '@/lib/pricing/service'
import type { CompetitorOfferRow } from '@/lib/queries'

type ChannelInput = {
  id: string
  marketplace_name: string
  price: number
  pricing: ReturnType<typeof priceChannel>
}

const PRESSURE_TONE: Record<PressureLevel, 'positive' | 'attention' | 'critical' | undefined> = {
  none: 'positive',
  light: undefined,
  relevant: 'attention',
  unknown_floor: 'attention',
  unviable: 'critical',
}

const yesNo = (v: boolean | null) => (v === true ? 'sim' : v === false ? 'não' : '—')

/** Same selection the engine uses: latest observation per competitor inside the freshness window, cheapest first. */
function latestPerCompetitor(rows: CompetitorOfferRow[], today: string, freshDays: number): CompetitorOffer[] {
  const seen = new Map<string, CompetitorOffer>()
  for (const r of rows) {
    const key = r.competitor_name.trim().toLowerCase()
    if (seen.has(key) || daysBetween(r.observed_on, today) >= freshDays) {
      if (!seen.has(key)) seen.set(key, null as unknown as CompetitorOffer)
      continue
    }
    seen.set(key, {
      name: r.competitor_name,
      price: Number(r.price),
      freeShipping: r.free_shipping,
      isFull: r.is_full,
      soldQuantity: r.sold_quantity,
      source: r.source,
      observedOn: r.observed_on,
      previousPrice: null,
    })
  }
  return [...seen.values()].filter(Boolean).sort((a, b) => a.price - b.price)
}

export function CompetitionPanel({
  productId,
  channels,
  offers,
  today,
  freshDays,
  gapPct,
}: {
  productId: string
  channels: ChannelInput[]
  offers: CompetitorOfferRow[]
  today: string
  freshDays: number
  gapPct: number
}) {
  return (
    <Panel title="Mercado / Concorrência" id="concorrencia" className="scroll-mt-6">
      <div className="flex flex-col divide-y divide-border">
        {channels.map((c) => {
          const rows = offers.filter((o) => o.product_channel_id === c.id)
          const all = latestPerCompetitor(rows, today, freshDays)
          const pr = all.length
            ? competitivePressure({ price: c.price, pricing: c.pricing, competition: { offers: all.length, cheapest: all[0], all } }, { competitivePriceGapPct: gapPct })
            : null
          const prices = all.map((o) => o.price)
          return (
            <section key={c.id} aria-label={`Concorrência em ${c.marketplace_name}`} className="flex flex-col gap-4 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{c.marketplace_name}</h3>
                {pr ? (
                  <Badge tone={PRESSURE_TONE[pr.level]}>{PRESSURE_LABEL[pr.level]}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Sem observações nos últimos {formatInt(freshDays)} dias
                  </span>
                )}
              </div>

              {pr ? (
                <>
                  <dl className="grid gap-px overflow-hidden rounded-md border border-border bg-border text-sm sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ['Nosso preço', formatBRL(c.price)],
                      ['Faixa observada', prices.length > 1 ? `${formatBRL(Math.min(...prices))} – ${formatBRL(Math.max(...prices))}` : formatBRL(prices[0])],
                      [pr.isolated ? 'Referência (menor da faixa)' : 'Menor oferta', `${formatBRL(pr.rival.price)} · ${formatPct(pr.gap, true)}`],
                      ['Piso econômico', pr.floor !== null ? formatBRL(pr.floor) : 'n/d (custo ou taxa ausente)'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-0.5 bg-surface px-3 py-2.5">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="tabular">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
                    {pr.isolated ? (
                      <li>
                        <span className="font-mono text-[11px] text-muted-foreground">INTERPRETAÇÃO </span>
                        {`Existe uma oferta a ${formatBRL(all[0].price)} (${all[0].name}) abaixo da faixa observada. Ela pode ser isolada e não representa o preço do mercado.`}
                      </li>
                    ) : null}
                    <li>
                      <span className="font-mono text-[11px] text-muted-foreground">FATO </span>
                      {pr.economyText}
                    </li>
                    {pr.viable === false ? (
                      <li className="text-attention">
                        Competição por preço economicamente inviável. O motor procura outras alavancas: exposição, tráfego, conversão, capa, frete/Full, Ads e promoção.
                      </li>
                    ) : null}
                  </ul>
                </>
              ) : null}

              {rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 pr-3 font-normal">Data</th>
                        <th scope="col" className="py-2 pr-3 font-normal">Concorrente</th>
                        <th scope="col" className="py-2 pr-3 text-right font-normal">Preço</th>
                        <th scope="col" className="py-2 pr-3 font-normal">Frete grátis</th>
                        <th scope="col" className="py-2 pr-3 font-normal">Full</th>
                        <th scope="col" className="py-2 pr-3 text-right font-normal">Vendidos</th>
                        <th scope="col" className="py-2 pr-3 font-normal">Fonte</th>
                        <th scope="col" className="py-2"><span className="sr-only">Ações</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.slice(0, 30).map((o) => (
                        <tr key={o.id} className={daysBetween(o.observed_on, today) >= freshDays ? 'opacity-50' : ''}>
                          <td className="py-2 pr-3 tabular">{formatDate(o.observed_on)}</td>
                          <td className="py-2 pr-3">
                            {o.url ? (
                              <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{o.competitor_name}</a>
                            ) : (
                              o.competitor_name
                            )}
                            {o.notes ? <span className="block text-xs text-muted-foreground">{o.notes}</span> : null}
                          </td>
                          <td className="py-2 pr-3 text-right tabular">{formatBRL(o.price)}</td>
                          <td className="py-2 pr-3">{yesNo(o.free_shipping)}</td>
                          <td className="py-2 pr-3">{yesNo(o.is_full)}</td>
                          <td className="py-2 pr-3 text-right tabular">{o.sold_quantity !== null ? formatInt(o.sold_quantity) : '—'}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{o.source}</td>
                          <td className="py-2 text-right">
                            <InlineAction action={deleteCompetitorOffer} fields={{ id: o.id, productId }} label="Remover" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          )
        })}

        <div className="flex flex-col gap-3 px-5 py-5">
          {channels.length ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {`Registre ofertas observadas. O motor usa só a observação mais recente de cada concorrente dos últimos ${formatInt(freshDays)} dias e nunca trata uma oferta isolada como preço do mercado.`}
              </p>
              <CompetitorOfferForm productId={productId} channels={channels} today={today} />
            </>
          ) : (
            <EmptyState title="Cadastre um canal antes de registrar concorrentes." />
          )}
        </div>
      </div>
    </Panel>
  )
}

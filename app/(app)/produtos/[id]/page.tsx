import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, CLASSIFICATION_LABEL, EXPERIMENT_STATUS_LABEL, experimentTone } from '@/components/ui/badges'
import { Disclosure, EmptyState, Panel, Section, buttonVariants } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { ChannelForm, CostLotForm, ProductForm } from '@/components/products/product-forms'
import { RecommendationCard } from '@/components/decisions/recommendation-card'
import { toggleCostLot } from '@/lib/actions/products'
import { formatBRL, formatDate, formatDateTime, formatPct, formatTestCode, todayISO } from '@/lib/format'
import { getActiveFeeRules, priceChannel } from '@/lib/pricing/service'
import {
  getCostLots,
  getPriceHistory,
  getProduct,
  getProductChannels,
  listExperiments,
  listMarketplaces,
  listCompetitorOffers,
  listRecommendations,
} from '@/lib/queries'
import { CompetitionPanel } from '@/components/products/competition-panel'
import { getEngineSettings } from '@/lib/settings'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const num = Number(id)
  const p = Number.isInteger(num) && num > 0 ? await getProduct(num) : null
  return { title: p?.name ?? 'Produto' }
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 md:border-l md:border-border md:pl-6 md:first:border-l-0 md:first:pl-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`truncate text-2xl font-semibold tracking-tight tabular ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const num = Number(id)
  if (!Number.isInteger(num) || num <= 0) notFound()
  const product = await getProduct(num)
  if (!product) notFound()

  const [channels, lots, history, experiments, recs, marketplaces, rules, settings, competitorOffers] = await Promise.all([
    getProductChannels(num),
    getCostLots(num),
    getPriceHistory(num),
    listExperiments({ productId: num }),
    listRecommendations({ productId: num, statuses: ['open'] }),
    listMarketplaces(),
    getActiveFeeRules(),
    getEngineSettings(),
    listCompetitorOffers(num),
  ])

  const cost = product.average_cost !== null ? Number(product.average_cost) : null
  const usedMarketplaces = new Set(channels.map((c) => c.marketplace_id))
  const freeMarketplaces = marketplaces.filter((m) => !usedMarketplaces.has(m.id))

  const priced = channels.map((c) => ({
    channel: c,
    pricing: priceChannel(
      {
        marketplaceId: Number(c.marketplace_id),
        price: Number(c.current_price),
        adsCostPct: Number(c.ads_cost_pct),
        sellerDiscount: Number(c.seller_discount),
        category: product.category,
        cost,
      },
      rules,
      settings.targetMarginPct,
      settings.minMarginPct,
    ),
  }))

  const marginTone = (pct: number) =>
    pct < settings.minMarginPct ? 'text-critical' : pct < settings.targetMarginPct ? 'text-attention' : 'text-positive'

  const main = priced[0]
  const mainMargin = main?.pricing.status === 'ok' ? main.pricing : null

  return (
    <>
      <header className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Link href="/produtos" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            ← Produtos
          </Link>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <p className="eyebrow">
                <span className="font-mono normal-case tracking-normal">{product.sku}</span> · {product.brand}
                {product.category ? ` · ${product.category}` : ''}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">{product.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{CLASSIFICATION_LABEL[product.classification]}</Badge>
              {!product.active ? <Badge tone="attention">Inativo</Badge> : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-border py-6 md:grid-cols-4 md:gap-0">
          <Fact label={main ? `Preço · ${main.channel.marketplace_name}` : 'Preço'} value={main ? formatBRL(main.channel.current_price) : '—'} />
          <Fact label="Custo médio" value={cost !== null ? formatBRL(cost) : 'Sem custo'} tone={cost === null ? 'text-attention' : undefined} />
          <Fact
            label="Margem de contribuição"
            value={mainMargin ? formatPct(mainMargin.marginPct) : '—'}
            tone={mainMargin ? marginTone(mainMargin.marginPct) : undefined}
          />
          <Fact label="Ações abertas" value={String(recs.length)} tone={recs.length ? 'text-primary' : undefined} />
        </div>
      </header>

      <Section title="O que fazer" id="acoes" className="scroll-mt-6">
        {recs.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {recs.map((r) => (
              <RecommendationCard key={r.id} rec={r} />
            ))}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">Nenhuma recomendação aberta para este produto.</p>
        )}
      </Section>

      <Section title="Margem por canal">
        {priced.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum canal cadastrado. Adicione um canal abaixo para calcular margem.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {priced.map(({ channel: c, pricing: r }) => (
              <article key={c.id} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.marketplace_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.external_id ?? 'sem ID'}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-2xl font-semibold tracking-tight tabular">{formatBRL(c.current_price)}</span>
                  {r.status === 'ok' ? (
                    <span className={`text-sm font-medium tabular ${marginTone(r.marginPct)}`}>{formatPct(r.marginPct)}</span>
                  ) : null}
                </div>
                {r.status === 'ok' ? (
                  <>
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular">
                      <span>Margem {formatBRL(r.contributionMargin)} por venda</span>
                      <span>
                        Equilíbrio {r.breakEvenPrice !== null ? formatBRL(r.breakEvenPrice) : 'n/d'} · Meta {formatPct(r.targetMarginPct)}{' '}
                        {r.targetMarginPrice !== null ? formatBRL(r.targetMarginPrice) : 'n/d'}
                      </span>
                    </div>
                    <Disclosure summary="Ver composição">
                      <dl className="flex flex-col gap-1.5 text-sm">
                        {[
                          ['Taxas marketplace', -r.marketplaceFees],
                          ['Ads', -r.adsCost],
                          ['Desconto vendedor', -r.sellerDiscount],
                          ['Custo médio', -r.cost],
                        ].map(([label, v]) => (
                          <div key={label as string} className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="tabular">{formatBRL(v)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between gap-2 border-t border-border pt-1.5 text-xs text-muted-foreground">
                          <dt>Regra</dt>
                          <dd>{r.rule.name}</dd>
                        </div>
                      </dl>
                    </Disclosure>
                  </>
                ) : (
                  <p className="text-sm leading-relaxed text-attention">{r.message}</p>
                )}
                <Link href={`/testes/novo?canal=${c.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mt-auto self-start' })}>
                  Criar teste neste canal
                </Link>
              </article>
            ))}
          </div>
        )}
      </Section>

      <CompetitionPanel
        productId={product.id}
        offers={competitorOffers}
        today={todayISO()}
        freshDays={settings.competitorFreshDays}
        gapPct={settings.competitivePriceGapPct}
        channels={priced.map(({ channel: c, pricing }) => ({
          id: c.id,
          marketplace_name: c.marketplace_name,
          price: Number(c.current_price),
          pricing,
        }))}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title={`Custo · média ponderada ${cost !== null ? formatBRL(cost) : '—'}`} className="scroll-mt-6" id="custo">
          <div className="flex flex-col gap-6 px-5 py-5">
            <CostLotForm productId={product.id} today={todayISO()} />
            {lots.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {lots.map((l) => (
                  <li key={l.id} className={`flex items-center justify-between gap-2 py-3 text-sm ${l.active ? '' : 'opacity-50'}`}>
                    <div className="flex flex-col">
                      <span className="tabular">
                        {l.quantity} un · {formatBRL(l.unit_cost)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(l.effective_date)}
                        {l.supplier ? ` · ${l.supplier}` : ''}
                      </span>
                    </div>
                    <InlineAction
                      action={toggleCostLot}
                      fields={{ id: l.id, productId: product.id, active: l.active ? 'false' : 'true' }}
                      label={l.active ? 'Desativar' : 'Reativar'}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>

        <Panel title="Testes">
          {experiments.length ? (
            <ul className="divide-y divide-border">
              {experiments.map((e) => (
                <li key={e.id}>
                  <Link href={`/testes/${e.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm transition-colors hover:bg-surface-2">
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{formatTestCode(e.id)}</span> · {e.marketplace_name} ·{' '}
                      {e.previous_value} → {e.new_value}
                    </span>
                    <Badge tone={experimentTone(e.status)}>{EXPERIMENT_STATUS_LABEL[e.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum teste neste produto." />
          )}
        </Panel>
      </div>

      <Section title="Detalhes">
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {channels.map((c) => (
            <Disclosure key={c.id} summary={`Canal ${c.marketplace_name}`} className="px-5 py-4">
              <ChannelForm productId={product.id} channel={c} marketplaces={marketplaces} />
            </Disclosure>
          ))}
          {freeMarketplaces.length ? (
            <Disclosure summary="Adicionar canal" defaultOpen={channels.length === 0} className="px-5 py-4">
              <ChannelForm productId={product.id} marketplaces={freeMarketplaces} />
            </Disclosure>
          ) : null}
          <Disclosure summary={`Histórico de preço (${history.length})`} className="px-5 py-4">
            {history.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-col gap-0.5 py-2.5 text-sm">
                    <span className="tabular">
                      {h.marketplace_name}: {h.previous_price ? `${formatBRL(h.previous_price)} → ` : ''}
                      {formatBRL(h.price)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(h.changed_at)} · {h.source}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem histórico.</p>
            )}
          </Disclosure>
          <Disclosure summary="Dados do produto" className="px-5 py-4">
            <ProductForm product={product} />
          </Disclosure>
        </div>
      </Section>
    </>
  )
}

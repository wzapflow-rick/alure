import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, CLASSIFICATION_LABEL, EXPERIMENT_STATUS_LABEL, experimentTone } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
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
  listRecommendations,
} from '@/lib/queries'
import { getEngineSettings } from '@/lib/settings'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const num = Number(id)
  const p = Number.isInteger(num) && num > 0 ? await getProduct(num) : null
  return { title: p?.name ?? 'Produto' }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const num = Number(id)
  if (!Number.isInteger(num) || num <= 0) notFound()
  const product = await getProduct(num)
  if (!product) notFound()

  const [channels, lots, history, experiments, recs, marketplaces, rules, settings] = await Promise.all([
    getProductChannels(num),
    getCostLots(num),
    getPriceHistory(num),
    listExperiments({ productId: num }),
    listRecommendations({ productId: num, statuses: ['open'] }),
    listMarketplaces(),
    getActiveFeeRules(),
    getEngineSettings(),
  ])

  const cost = product.average_cost !== null ? Number(product.average_cost) : null
  const usedMarketplaces = new Set(channels.map((c) => c.marketplace_id))
  const freeMarketplaces = marketplaces.filter((m) => !usedMarketplaces.has(m.id))

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/produtos" className="text-xs text-muted-foreground hover:text-foreground">← Produtos</Link>
        <PageHeader
          title={product.name}
          description={`${product.sku} · ${product.brand}${product.category ? ` · ${product.category}` : ''}`}
          action={
            <div className="flex items-center gap-2">
              <Badge>{CLASSIFICATION_LABEL[product.classification]}</Badge>
              {!product.active ? <Badge tone="attention">Inativo</Badge> : null}
            </div>
          }
        />
      </div>

      <section aria-label="Margem por canal" className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 xl:grid-cols-3">
        {channels.length === 0 ? (
          <div className="bg-surface md:col-span-3">
            <EmptyState title="Nenhum canal cadastrado." description="Adicione um canal abaixo para calcular margem." />
          </div>
        ) : (
          channels.map((c) => {
            const r = priceChannel(
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
            )
            return (
              <div key={c.id} className="flex flex-col gap-4 bg-surface px-5 py-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.marketplace_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.external_id ?? 'sem ID'}</span>
                </div>
                <span className="text-2xl font-semibold tabular">{formatBRL(c.current_price)}</span>
                {r.status === 'ok' ? (
                  <>
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
                      <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                        <dt>Margem de contribuição</dt>
                        <dd className={`tabular ${r.marginPct < settings.minMarginPct ? 'text-critical' : r.marginPct < settings.targetMarginPct ? 'text-attention' : 'text-positive'}`}>
                          {formatBRL(r.contributionMargin)} · {formatPct(r.marginPct)}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-3 py-2 font-mono text-[11px] text-muted-foreground tabular">
                      <span>Equilíbrio: {r.breakEvenPrice !== null ? formatBRL(r.breakEvenPrice) : 'n/d'}</span>
                      <span>Meta {formatPct(r.targetMarginPct)}: {r.targetMarginPrice !== null ? formatBRL(r.targetMarginPrice) : 'n/d'}</span>
                      <span>Regra: {r.rule.name}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm leading-relaxed text-attention">{r.message}</p>
                )}
                <Link href={`/testes/novo?canal=${c.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}>
                  Criar teste neste canal
                </Link>
              </div>
            )
          })
        )}
      </section>

      {recs.length ? (
        <Panel title="Recomendações abertas">
          <div className="divide-y divide-border">
            {recs.map((r) => (
              <RecommendationCard key={r.id} rec={r} compact />
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title={`Custo · média ponderada ${cost !== null ? formatBRL(cost) : '—'}`}>
          <div className="flex flex-col gap-6 px-5 py-5">
            <CostLotForm productId={product.id} today={todayISO()} />
            {lots.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {lots.map((l) => (
                  <li key={l.id} className={`flex items-center justify-between gap-2 py-3 text-sm ${l.active ? '' : 'opacity-50'}`}>
                    <div className="flex flex-col">
                      <span className="tabular">{l.quantity} un · {formatBRL(l.unit_cost)}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(l.effective_date)}{l.supplier ? ` · ${l.supplier}` : ''}</span>
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
                  <Link href={`/testes/${e.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-2">
                    <span><span className="font-mono text-xs text-muted-foreground">{formatTestCode(e.id)}</span> · {e.marketplace_name} · {e.previous_value} → {e.new_value}</span>
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

      <Panel title="Canais">
        <div className="flex flex-col divide-y divide-border">
          {channels.map((c) => (
            <details key={c.id} className="group px-5 py-4">
              <summary className="cursor-pointer text-sm">{c.marketplace_name} · editar</summary>
              <div className="pt-4">
                <ChannelForm productId={product.id} channel={c} marketplaces={marketplaces} />
              </div>
            </details>
          ))}
          {freeMarketplaces.length ? (
            <details className="px-5 py-4" open={channels.length === 0}>
              <summary className="cursor-pointer text-sm text-primary">Adicionar canal</summary>
              <div className="pt-4">
                <ChannelForm productId={product.id} marketplaces={freeMarketplaces} />
              </div>
            </details>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="Histórico de preço">
          {history.length ? (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm">
                  <span className="tabular">
                    {h.marketplace_name}: {h.previous_price ? `${formatBRL(h.previous_price)} → ` : ''}{formatBRL(h.price)}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(h.changed_at)} · {h.source}{h.reason ? ` · ${h.reason}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sem histórico." />
          )}
        </Panel>
        <Panel title="Dados do produto">
          <div className="px-5 py-5">
            <ProductForm product={product} />
          </div>
        </Panel>
      </div>
    </>
  )
}

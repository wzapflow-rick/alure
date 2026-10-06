import type { Metadata } from 'next'
import { Disclosure, EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { ProfitFiltersBar, buildPresets } from '@/components/profit/filters'
import { ProfitSummary } from '@/components/profit/summary'
import { DayTable, ProductTable } from '@/components/profit/tables'
import { AdSpendForm, RefreshShippingButton, TaxRateForm } from '@/components/profit/settings-forms'
import { getProfitReport, profitSchemaReady, type ProfitFilters } from '@/lib/profit/queries'
import { todayISO } from '@/lib/format'

export const metadata: Metadata = { title: 'Lucratividade' }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['valid', 'cancelled', 'all'] as const

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; q?: string; status?: string }>
}) {
  const sp = await searchParams
  const today = todayISO()
  let from = sp.de && ISO.test(sp.de) ? sp.de : today
  let to = sp.ate && ISO.test(sp.ate) ? sp.ate : from
  if (from > to) [from, to] = [to, from]
  const filters: ProfitFilters = {
    from,
    to,
    q: (sp.q ?? '').slice(0, 100),
    status: STATUSES.find((s) => s === sp.status) ?? 'valid',
  }

  const ready = await profitSchemaReady()
  const report = await getProfitReport(filters, ready)
  const multiDay = from !== to

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Vendas e lucratividade"
        description="Quanto vendemos, quanto ficou com o ML, quanto pagamos de frete e Ads, e o que sobrou de margem."
        action={<RefreshShippingButton from={from} to={to} />}
      />

      {!ready ? (
        <p className="rounded-lg border border-attention/40 bg-attention/10 px-4 py-3 text-sm leading-relaxed">
          Rode o <span className="font-mono">db/015_lucratividade.sql</span> para gravar o frete pago por pedido e o
          investimento em Ads. Até lá, frete do vendedor e Ads lançados aparecem zerados.
        </p>
      ) : null}

      <ProfitFiltersBar filters={filters} presets={buildPresets(today)} />

      {report.summary.orders === 0 && report.summary.cancelledOrders === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhuma venda no período."
            description="Escolha outro período ou rode a sincronização do Mercado Livre em Configurações."
          />
        </Panel>
      ) : (
        <ProfitSummary report={report} />
      )}

      {multiDay && report.days.length ? (
        <Panel title="Por dia">
          <DayTable rows={report.days} />
        </Panel>
      ) : null}

      {report.products.length ? (
        <Panel title={`Por produto · ${report.products.length}`}>
          <ProductTable rows={report.products} />
        </Panel>
      ) : null}

      <Panel title="Lançamentos e ajustes">
        <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
          <Disclosure summary="Lançar investimento em Ads" defaultOpen={ready && report.summary.adsDays === 0}>
            <AdSpendForm from={from} to={to} />
          </Disclosure>
          <Disclosure summary={`Alíquota de imposto · ${report.taxRatePct.toLocaleString('pt-BR')}%`}>
            <TaxRateForm value={report.taxRatePct} />
          </Disclosure>
          <Disclosure summary="Como cada número é calculado">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Vendas válidas: pedidos pagos no ML (data do pedido, horário de São Paulo). Total = válidas + canceladas.</li>
              <li>Custo do produto: custo médio cadastrado × unidades. Itens sem custo ficam marcados.</li>
              <li>Tarifas ML: tarifa de venda real que vem em cada pedido.</li>
              <li>Impostos: impostos informados pelo ML + a alíquota configurada sobre a venda.</li>
              <li>Frete: valor que o vendedor pagou em cada envio, lido do ML (botão “Ler fretes do ML”).</li>
              <li>Publicidade: valores lançados por dia aqui ou vindos da métrica de Ads.</li>
            </ul>
          </Disclosure>
        </div>
      </Panel>
    </div>
  )
}

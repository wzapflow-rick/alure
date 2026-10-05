import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@/components/ui/badges'
import { EmptyState, Input, Panel, Section, Stat, buttonVariants } from '@/components/ui/primitives'
import { ListsPanel } from '@/components/prospect/lists-panel'
import { ProspectResults } from '@/components/prospect/results'
import { SearchPanel, VerificationPanel } from '@/components/prospect/search-panels'
import { formatDateTime } from '@/lib/broadcast/labels'
import { evolutionConfig } from '@/lib/notify/evolution'
import { FILTER_LABEL } from '@/lib/prospect/labels'
import {
  PROSPECT_FILTERS,
  checksToday,
  listProspectLists,
  listProspects,
  listSearches,
  loadProspectSettings,
  prospectSchemaReady,
  prospectStats,
  type ProspectFilter,
} from '@/lib/prospect/queries'
import { serpApiKey } from '@/lib/prospect/serpapi'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Prospecção · Disparos' }
export const maxDuration = 300

export default async function ProspectingPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; f?: string; q?: string }>
}) {
  if (!(await prospectSchemaReady().catch(() => false))) {
    return (
      <Panel>
        <EmptyState title="Tabelas de prospecção ainda não criadas." description="Rode o script db/014_prospeccao.sql no pgAdmin e recarregue a página." />
      </Panel>
    )
  }

  const params = await searchParams
  const searchId = params.busca && /^\d+$/.test(params.busca) ? params.busca : null
  const filter: ProspectFilter = PROSPECT_FILTERS.includes(params.f as ProspectFilter) ? (params.f as ProspectFilter) : 'all'
  const q = params.q ?? ''

  const settings = await loadProspectSettings()
  const [stats, today, searches, prospects, lists] = await Promise.all([
    prospectStats(),
    checksToday(),
    listSearches(),
    listProspects({ searchId, filter, q }),
    listProspectLists(settings.require_whatsapp),
  ])
  const currentSearch = searches.find((s) => s.id === searchId)
  const pendingHere = searchId ? prospects.filter((p) => p.wa_status === 'pending' || p.wa_status === 'error').length : stats.pending + stats.error

  const linkFor = (next: { busca?: string | null; f?: string }) => ({
    pathname: '/disparos/prospeccao',
    query: {
      ...((next.busca === undefined ? searchId : next.busca) ? { busca: next.busca === undefined ? searchId : next.busca } : {}),
      ...((next.f ?? filter) !== 'all' ? { f: next.f ?? filter } : {}),
      ...(q ? { q } : {}),
    },
  })

  return (
    <>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Prospectados" value={stats.total} />
        <Stat label="Com WhatsApp" value={stats.yes} tone={stats.yes ? 'positive' : undefined} />
        <Stat label="A verificar" value={stats.pending + stats.error} />
        <Stat label="Descartados" value={stats.no + stats.no_phone} hint={`${stats.no} sem WhatsApp · ${stats.no_phone} sem telefone`} />
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        Esses contatos não conhecem a ALURE. Comece com campanhas pequenas, mensagem que se apresenta e pergunta antes de vender, e
        acompanhe as respostas: denúncias de quem não esperava a mensagem são o que bane o número.
      </p>

      <SearchPanel configured={Boolean(serpApiKey())} />

      <VerificationPanel
        settings={settings}
        checkedToday={today}
        pending={pendingHere}
        searchId={searchId}
        evolutionReady={Boolean(evolutionConfig())}
      />

      {searches.length ? (
        <Section title="Buscas recentes">
          <nav aria-label="Buscas" className="flex flex-wrap gap-2">
            <Link
              href={linkFor({ busca: null })}
              className={cn(buttonVariants({ variant: searchId ? 'secondary' : 'primary', size: 'sm' }))}
            >
              Todas
            </Link>
            {searches.map((s) => (
              <Link
                key={s.id}
                href={linkFor({ busca: s.id })}
                title={s.error ?? `${formatDateTime(s.created_at)} · ${s.found} encontrados, ${s.created} novos`}
                className={cn(buttonVariants({ variant: s.id === searchId ? 'primary' : 'secondary', size: 'sm' }), 'gap-2')}
              >
                <span className="max-w-56 truncate">
                  {s.query}
                  {s.location ? ` · ${s.location}` : ''}
                </span>
                {s.status === 'failed' ? (
                  <Badge tone="critical">falhou</Badge>
                ) : s.status === 'running' ? (
                  <Badge>buscando</Badge>
                ) : (
                  <span className="text-xs tabular opacity-70">
                    {s.with_whatsapp}/{s.found}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          {currentSearch?.error ? <p className="text-sm text-critical">{currentSearch.error}</p> : null}
        </Section>
      ) : null}

      <Section
        title="Resultados"
        meta={`${prospects.length}${prospects.length === 300 ? '+' : ''} exibidos${currentSearch ? ` · ${currentSearch.query}` : ''}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Filtro" className="flex flex-wrap gap-2">
            {PROSPECT_FILTERS.map((key) => (
              <Link
                key={key}
                href={linkFor({ f: key })}
                className={cn(buttonVariants({ variant: filter === key ? 'primary' : 'secondary', size: 'sm' }))}
              >
                {FILTER_LABEL[key]}
              </Link>
            ))}
          </nav>
          <form className="flex gap-2" action="/disparos/prospeccao">
            {searchId ? <input type="hidden" name="busca" value={searchId} /> : null}
            {filter !== 'all' ? <input type="hidden" name="f" value={filter} /> : null}
            <label htmlFor="q" className="sr-only">
              Filtrar resultados
            </label>
            <Input id="q" name="q" defaultValue={q} placeholder="Nome, categoria ou endereço" className="sm:w-64" />
          </form>
        </div>
        <ProspectResults prospects={prospects} lists={lists} />
      </Section>

      <Section title="Listas" meta={`${lists.length}`}>
        <ListsPanel lists={lists} />
      </Section>
    </>
  )
}

import type { Metadata } from 'next'
import { EmptyState, Input, Panel, Section, Stat } from '@/components/ui/primitives'
import { Chips } from '@/components/ui/tab-nav'
import { ListsPanel } from '@/components/prospect/lists-panel'
import { ProspectResults } from '@/components/prospect/results'
import { SearchPanel } from '@/components/prospect/search-panels'
import { AutoSubmitSelect } from '@/components/prospect/select-all'
import { FILTER_LABEL } from '@/lib/prospect/labels'
import {
  PROSPECT_FILTERS,
  listProspectLists,
  listProspects,
  listSearches,
  loadProspectSettings,
  prospectSchemaReady,
  prospectStats,
  type ProspectFilter,
} from '@/lib/prospect/queries'
import { serpApiKey } from '@/lib/prospect/serpapi'
import { requireDspUser } from '@/lib/dsp/session'

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

  const user = await requireDspUser()
  const settings = await loadProspectSettings(user.companyId)
  const [stats, searches, prospects, lists] = await Promise.all([
    prospectStats(user.companyId),
    listSearches(user.companyId),
    listProspects(user.companyId, { searchId, filter, q }),
    listProspectLists(user.companyId, settings.require_whatsapp),
  ])
  const currentSearch = searches.find((s) => s.id === searchId)

  const filterHref = (f: ProspectFilter) => ({
    pathname: '/disparos/prospeccao',
    query: { ...(searchId ? { busca: searchId } : {}), ...(f !== 'all' ? { f } : {}), ...(q ? { q } : {}) },
  })

  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        <Stat label="Prospectados" value={stats.total} />
        <Stat label="Com WhatsApp" value={stats.yes} tone={stats.yes ? 'positive' : undefined} />
        <Stat label="A verificar" value={stats.pending + stats.error} />
        <Stat label="Descartados" value={stats.no + stats.no_phone} hint={`${stats.no} sem WhatsApp · ${stats.no_phone} sem tel.`} />
      </div>

      <div className="flex flex-col gap-4">
        <SearchPanel configured={Boolean(serpApiKey())} />
      </div>

      <Section title="Resultados" meta={`${prospects.length}${prospects.length === 300 ? '+' : ''}`}>
        <form action="/disparos/prospeccao" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {filter !== 'all' ? <input type="hidden" name="f" value={filter} /> : null}
          <label htmlFor="busca" className="sr-only">
            Busca
          </label>
          <AutoSubmitSelect id="busca" name="busca" defaultValue={searchId ?? ''}>
            <option value="">Todas as buscas</option>
            {searches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.query}
                {s.location ? ` · ${s.location}` : ''}
                {s.status === 'failed' ? ' (falhou)' : s.status === 'running' ? ' (buscando)' : ` · ${s.with_whatsapp}/${s.found}`}
              </option>
            ))}
          </AutoSubmitSelect>
          <label htmlFor="q" className="sr-only">
            Filtrar por nome, categoria ou endereço
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Filtrar por nome, categoria ou endereço" />
        </form>

        <Chips
          label="Filtro de status"
          items={PROSPECT_FILTERS.map((key) => ({ key, href: filterHref(key), label: FILTER_LABEL[key], active: filter === key }))}
        />

        {currentSearch?.error ? <p className="text-sm text-critical">{currentSearch.error}</p> : null}

        <ProspectResults prospects={prospects} lists={lists} />
      </Section>

      <Section title="Listas" meta={`${lists.length}`}>
        <ListsPanel lists={lists} />
      </Section>
    </>
  )
}

import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badges'
import { EmptyState, Field, Input, Panel, Section, Stat, Textarea } from '@/components/ui/primitives'
import { Chips } from '@/components/ui/tab-nav'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { importContacts, setContactOptOut } from '@/lib/actions/broadcast'
import { formatDateTime } from '@/lib/broadcast/labels'
import { contactStats, listContacts, loadSettings } from '@/lib/broadcast/queries'
import { formatPhone } from '@/lib/broadcast/text'

export const metadata: Metadata = { title: 'Contatos · Disparos' }

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'replied', label: 'Responderam' },
  { key: 'opted_out', label: 'Descadastrados' },
  { key: 'invalid', label: 'Sem WhatsApp' },
]

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = '', f = 'all' } = await searchParams
  const filter = FILTERS.some((x) => x.key === f) ? f : 'all'
  const settings = await loadSettings()
  const [stats, contacts] = await Promise.all([contactStats(settings.contact_cooldown_days), listContacts(q, filter)])

  return (
    <>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Na base" value={stats.total} />
        <Stat label="Elegíveis agora" value={stats.eligible} hint={`Sem contato há ${settings.contact_cooldown_days}+ dias`} />
        <Stat label="Responderam" value={stats.replied} tone={stats.replied ? 'positive' : undefined} />
        <Stat label="Descadastrados" value={stats.opted_out} hint={`${stats.invalid} sem WhatsApp`} />
      </div>

      <Panel title="Importar contatos">
        <ActionForm action={importContacts} className="gap-4 p-4 sm:p-5" resetOnSuccess>
          <Field
            label="Lista (um contato por linha)"
            htmlFor="list"
            hint="Aceita “Nome; telefone”, “telefone, Nome”, colunas copiadas de planilha ou só o número. DDD obrigatório; o 55 é adicionado sozinho. Duplicados são unidos."
          >
            <Textarea id="list" name="list" required rows={8} className="font-mono text-[13px]" placeholder={'Maria Souza; (11) 98765-4321\nJoão Lima, 21 99876-5432\n5531988887777'} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Etiqueta (opcional)" htmlFor="tag" hint="Use para separar públicos: arquitetos, lojas, clientes…">
              <Input id="tag" name="tag" maxLength={40} placeholder="arquitetos" />
            </Field>
            <Field label="Origem (opcional)" htmlFor="source">
              <Input id="source" name="source" maxLength={80} placeholder="Clientes do Mercado Livre" />
            </Field>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="consent" required className="mt-0.5 accent-primary" />
            <span>
              Esses contatos conhecem a ALURE (clientes, leads ou parceiros) e não vieram de lista comprada.
              <span className="block text-xs text-muted-foreground">Mensagens para quem não conhece a marca geram denúncias, e denúncias banem o número.</span>
            </span>
          </label>
          <SubmitButton className="self-start">Importar</SubmitButton>
        </ActionForm>
      </Panel>

      <Section title="Contatos" meta={`${contacts.length}${contacts.length === 200 ? '+' : ''} exibidos`}>
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
          <form className="flex gap-2" action="/disparos/contatos">
            {filter !== 'all' ? <input type="hidden" name="f" value={filter} /> : null}
            <label htmlFor="q" className="sr-only">
              Buscar contato
            </label>
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Nome, telefone ou etiqueta" className="sm:w-64" />
          </form>
          <Chips
            label="Filtro"
            items={FILTERS.map((x) => ({
              key: x.key,
              href: { pathname: '/disparos/contatos', query: { ...(q ? { q } : {}), ...(x.key !== 'all' ? { f: x.key } : {}) } },
              label: x.label,
              active: filter === x.key,
            }))}
          />
        </div>
        <Panel>
          {contacts.length ? (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{c.name ?? 'Sem nome'}</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatPhone(c.phone)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.opted_out ? <Badge tone="critical">Descadastrado</Badge> : null}
                    {c.wa_exists === false ? <Badge tone="attention">Sem WhatsApp</Badge> : null}
                    {c.last_reply_at ? <Badge tone="positive">Respondeu</Badge> : null}
                    {c.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground tabular sm:w-32 sm:text-right">
                    {c.last_sent_at ? `Último envio ${formatDateTime(c.last_sent_at)}` : 'Nunca contatado'}
                  </span>
                  <InlineAction
                    action={setContactOptOut}
                    fields={{ id: c.id, opted_out: String(!c.opted_out) }}
                    label={c.opted_out ? 'Reativar' : 'Descadastrar'}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={q || filter !== 'all' ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda.'} description="Importe uma lista acima para começar." />
          )}
        </Panel>
      </Section>
    </>
  )
}

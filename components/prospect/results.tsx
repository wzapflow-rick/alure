import { Badge } from '@/components/ui/badges'
import { EmptyState, Input, Panel, Select } from '@/components/ui/primitives'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { SelectAll } from '@/components/prospect/select-all'
import { addToProspectList } from '@/lib/actions/prospect'
import { formatPhone } from '@/lib/broadcast/text'
import { WA_STATUS, siteHost } from '@/lib/prospect/labels'
import type { ListRow, ProspectRow } from '@/lib/prospect/queries'

export function ProspectResults({ prospects, lists }: { prospects: ProspectRow[]; lists: ListRow[] }) {
  if (!prospects.length) {
    return (
      <Panel>
        <EmptyState title="Nenhum contato aqui." description="Faça uma busca acima ou troque o filtro." />
      </Panel>
    )
  }

  return (
    <ActionForm action={addToProspectList} className="gap-3">
      <Panel>
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <SelectAll />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="list_id" className="sr-only">
              Lista de destino
            </label>
            <Select id="list_id" name="list_id" defaultValue="" className="sm:w-48">
              <option value="">Nova lista…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <label htmlFor="list_name" className="sr-only">
              Nome da nova lista
            </label>
            <Input id="list_name" name="list_name" maxLength={60} placeholder="Nome da nova lista" className="sm:w-48" />
            <SubmitButton size="sm">Adicionar à lista</SubmitButton>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {prospects.map((p) => {
            const status = WA_STATUS[p.wa_status]
            const dispatchPhone = p.site_whatsapp ?? p.phone
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer flex-col gap-2 px-5 py-3 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={p.id}
                      data-whatsapp={String(p.wa_status === 'yes')}
                      defaultChecked={p.wa_status === 'yes' && !p.in_base}
                      className="mt-1 accent-primary"
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[p.category, p.address].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 pl-7 sm:w-44 sm:pl-0">
                    <span className="font-mono text-xs tabular">{dispatchPhone ? formatPhone(dispatchPhone) : '—'}</span>
                    {p.site_whatsapp && p.site_whatsapp !== p.phone ? (
                      <span className="text-xs text-muted-foreground">WhatsApp do site</span>
                    ) : null}
                    {p.website ? <span className="truncate text-xs text-muted-foreground">{siteHost(p.website)}</span> : null}
                  </div>
                  <span className="pl-7 text-xs text-muted-foreground tabular sm:w-20 sm:pl-0 sm:text-right">
                    {p.rating ? `${Number(p.rating).toFixed(1)} · ${p.reviews ?? 0}` : 'sem nota'}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 pl-7 sm:w-56 sm:justify-end sm:pl-0">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {p.in_base ? <Badge tone="info">Já nos contatos</Badge> : null}
                    {p.lists.map((l) => (
                      <Badge key={l}>{l}</Badge>
                    ))}
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      </Panel>
    </ActionForm>
  )
}

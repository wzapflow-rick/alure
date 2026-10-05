import { Globe, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badges'
import { EmptyState, Panel } from '@/components/ui/primitives'
import { ActionForm } from '@/components/forms/action-form'
import { BulkBar } from '@/components/prospect/select-all'
import { addToProspectList } from '@/lib/actions/prospect'
import { formatPhone } from '@/lib/broadcast/text'
import { WA_STATUS, siteHost } from '@/lib/prospect/labels'
import type { ListRow, ProspectRow } from '@/lib/prospect/queries'

export function ProspectResults({ prospects, lists }: { prospects: ProspectRow[]; lists: ListRow[] }) {
  if (!prospects.length) {
    return (
      <Panel>
        <EmptyState title="Nenhum contato aqui." description="Faça uma busca ou troque o filtro." />
      </Panel>
    )
  }

  return (
    <ActionForm action={addToProspectList} className="gap-3">
      <Panel>
        <BulkBar lists={lists.map((l) => ({ id: l.id, name: l.name }))} />
        <ul className="divide-y divide-border">
          {prospects.map((p) => {
            const status = WA_STATUS[p.wa_status]
            const dispatchPhone = p.site_whatsapp ?? p.phone
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                  <input
                    type="checkbox"
                    name="ids"
                    value={p.id}
                    data-whatsapp={String(p.wa_status === 'yes')}
                    defaultChecked={p.wa_status === 'yes' && !p.in_base}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{[p.category, p.address].filter(Boolean).join(' · ')}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:w-56 md:flex-col md:items-start md:gap-0.5">
                      <span className="font-mono text-foreground tabular">
                        {dispatchPhone ? formatPhone(dispatchPhone) : 'sem telefone'}
                        {p.site_whatsapp && p.site_whatsapp !== p.phone ? (
                          <span className="ml-1.5 font-sans text-muted-foreground">via site</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-3">
                        {p.rating ? (
                          <span className="flex items-center gap-1 tabular">
                            <Star className="size-3" aria-hidden />
                            {Number(p.rating).toFixed(1)} ({p.reviews ?? 0})
                          </span>
                        ) : null}
                        {p.website ? (
                          <span className="flex min-w-0 items-center gap-1">
                            <Globe className="size-3 shrink-0" aria-hidden />
                            <span className="max-w-36 truncate">{siteHost(p.website)}</span>
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 md:w-44 md:justify-end">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {p.in_base ? <Badge tone="info">Nos contatos</Badge> : null}
                      {p.lists.map((l) => (
                        <Badge key={l}>{l}</Badge>
                      ))}
                    </div>
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

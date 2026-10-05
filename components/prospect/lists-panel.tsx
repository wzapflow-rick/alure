import Link from 'next/link'
import { Badge } from '@/components/ui/badges'
import { EmptyState, Panel, buttonVariants } from '@/components/ui/primitives'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { deleteProspectList, exportProspectList } from '@/lib/actions/prospect'
import { formatDateTime } from '@/lib/broadcast/labels'
import type { ListRow } from '@/lib/prospect/queries'

export function ListsPanel({ lists }: { lists: ListRow[] }) {
  return (
    <Panel>
      {lists.length ? (
        <ul className="divide-y divide-border">
          {lists.map((l) => (
            <li key={l.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center md:gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {l.name}
                  <Badge>{l.tag}</Badge>
                </span>
                <span className="text-xs text-muted-foreground tabular">
                  {l.total} contatos · {l.exportable} prontos para envio
                  {l.exported_at ? ` · ${l.exported_count} enviados em ${formatDateTime(l.exported_at)}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionForm action={exportProspectList} className="gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <SubmitButton size="sm" variant={l.exported_at ? 'secondary' : 'primary'} disabled={!l.exportable}>
                    {l.exported_at ? 'Reenviar' : 'Enviar para Disparos'}
                  </SubmitButton>
                </ActionForm>
                {l.exported_at ? (
                  <Link href="/disparos/nova" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Criar campanha
                  </Link>
                ) : null}
                <InlineAction action={deleteProspectList} fields={{ id: l.id }} label="Excluir" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nenhuma lista ainda."
          description="Marque contatos nos resultados e adicione a uma lista. Ao enviar para Disparos, eles entram em Contatos com a etiqueta da lista."
        />
      )}
    </Panel>
  )
}

import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { DocumentUploader } from '@/components/documents/document-uploader'
import { deleteDocument } from '@/lib/actions/documents'
import { listDocuments } from '@/lib/documents/queries'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Documentos' }
export const maxDuration = 60

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export default async function DocumentsPage() {
  const docs = await listDocuments()
  return (
    <>
      <PageHeader
        title="Documentos"
        description="Catálogos, tabelas de preço e manuais que o assistente pode consultar. No chat, é só pedir: “dê uma olhada no catálogo da Deca”."
      />
      <div className="grid gap-8 lg:grid-cols-3">
        <Panel title={`Na memória do assistente (${docs.length})`} className="lg:col-span-2">
          {docs.length ? (
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                  <FileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm font-medium text-pretty break-words">{d.title}</p>
                    <p className="text-xs text-muted-foreground break-all">{d.file_name}</p>
                    <p className="font-mono text-xs text-muted-foreground tabular">
                      {d.pages} páginas · {formatMb(d.file_bytes)} · {formatDate(d.created_at.slice(0, 10))}
                      {d.user_name ? ` · ${d.user_name}` : ''}
                    </p>
                    {d.notes ? <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{d.notes}</p> : null}
                  </div>
                  <InlineAction action={deleteDocument} fields={{ id: d.id }} label="Remover" variant="ghost" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhum documento ainda."
              description="Envie um PDF ao lado. O texto é lido uma vez e fica guardado para o assistente buscar só as páginas que precisar."
            />
          )}
        </Panel>
        <Panel title="Enviar documento">
          <div className="px-4 py-5 sm:px-5">
            <DocumentUploader />
          </div>
        </Panel>
      </div>
    </>
  )
}

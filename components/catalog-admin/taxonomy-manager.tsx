'use client'

import { useState } from 'react'
import { Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { Badge } from '@/components/ui/badges'
import { Button, Input, Panel } from '@/components/ui/primitives'
import {
  createTaxonomyEntry,
  deleteTaxonomyEntry,
  renameTaxonomyEntry,
  restoreTaxonomyEntry,
} from '@/lib/actions/catalog-taxonomy'

export type ManagedEntry = {
  id: number
  label: string
  isDefault: boolean
  hidden: boolean
  count: number
}

const COPY = {
  category: {
    title: 'Categorias',
    add: 'Nova categoria',
    placeholder: 'Ex.: Lavatórios',
    fallback: 'Automática (pelo nome)',
    autoHint: 'Também reconhece itens pelo nome',
  },
  finish: {
    title: 'Acabamentos',
    add: 'Novo acabamento',
    placeholder: 'Ex.: Grafite',
    fallback: 'Automático (pelo nome)',
    autoHint: 'Também reconhece itens pelo nome',
  },
} as const

function itemsLabel(count: number) {
  return count === 1 ? '1 item' : `${count} itens`
}

function EntryRow({ entry, kind }: { entry: ManagedEntry; kind: keyof typeof COPY }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const inputId = `tx-${entry.id}`

  if (mode === 'edit') {
    return (
      <li className="px-4 py-3 sm:px-5">
        <ActionForm action={renameTaxonomyEntry} onSuccess={() => setMode('view')} className="gap-2">
          <input type="hidden" name="id" value={entry.id} />
          <label htmlFor={inputId} className="sr-only">
            {`Novo nome para ${entry.label}`}
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              name="label"
              defaultValue={entry.label}
              maxLength={80}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMode('view')
              }}
            />
            <SubmitButton size="sm">
              <Check className="size-4" aria-hidden /> Salvar
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode('view')}>
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Os itens com esse nome são atualizados juntos. Se o nome já existir, as duas são juntadas.
          </p>
        </ActionForm>
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{entry.label}</span>
          {entry.isDefault ? <Badge tone="info">Padrão</Badge> : null}
        </div>
        <span className="text-xs text-muted-foreground">
          {itemsLabel(entry.count)}
          {entry.isDefault ? ` · ${COPY[kind].autoHint}` : null}
        </span>
      </div>

      {mode === 'confirm' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {entry.count ? `${itemsLabel(entry.count)} voltam para “${COPY[kind].fallback}”.` : 'Excluir?'}
          </span>
          <InlineAction action={deleteTaxonomyEntry} fields={{ id: entry.id }} label="Confirmar" variant="danger" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('view')}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('edit')}>
            <Pencil className="size-4" aria-hidden /> Renomear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode('confirm')}
            className="text-critical hover:text-critical"
          >
            <Trash2 className="size-4" aria-hidden /> Excluir
          </Button>
        </div>
      )}
    </li>
  )
}

export function TaxonomyPanel({ kind, entries }: { kind: keyof typeof COPY; entries: ManagedEntry[] }) {
  const copy = COPY[kind]
  const visible = entries.filter((e) => !e.hidden)
  const hidden = entries.filter((e) => e.hidden)
  const addId = `tx-add-${kind}`

  return (
    <Panel title={copy.title} action={<span className="text-xs text-muted-foreground">{visible.length} ativas</span>}>
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <ActionForm action={createTaxonomyEntry} resetOnSuccess className="gap-2">
          <input type="hidden" name="kind" value={kind} />
          <label htmlFor={addId} className="text-xs font-medium text-muted-foreground">
            {copy.add}
          </label>
          <div className="flex gap-2">
            <Input id={addId} name="label" maxLength={80} placeholder={copy.placeholder} required minLength={2} />
            <SubmitButton size="sm">Adicionar</SubmitButton>
          </div>
        </ActionForm>
      </div>

      {visible.length ? (
        <ul className="divide-y divide-border">
          {visible.map((entry) => (
            <EntryRow key={entry.id} entry={entry} kind={kind} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma ainda. Adicione a primeira acima.</p>
      )}

      {hidden.length ? (
        <details className="border-t border-border px-4 py-3 sm:px-5">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {`Padrões excluídos (${hidden.length})`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {hidden.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <X className="size-3.5" aria-hidden /> {entry.label}
                </span>
                <InlineAction
                  action={restoreTaxonomyEntry}
                  fields={{ id: entry.id }}
                  label={
                    <>
                      <RotateCcw className="size-4" aria-hidden /> Restaurar
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  )
}

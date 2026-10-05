'use client'

import { useState } from 'react'
import { Button, Input, Select } from '@/components/ui/primitives'
import { SubmitButton } from '@/components/forms/action-form'

function setAll(button: HTMLButtonElement, mode: 'all' | 'none' | 'whatsapp') {
  const form = button.closest('form')
  form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]').forEach((box) => {
    box.checked = mode === 'all' || (mode === 'whatsapp' && box.dataset.whatsapp === 'true')
  })
}

export function BulkBar({ lists }: { lists: { id: string; name: string }[] }) {
  const [listId, setListId] = useState('')
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="-ml-2 flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={(e) => setAll(e.currentTarget, 'whatsapp')}>
          Só com WhatsApp
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={(e) => setAll(e.currentTarget, 'all')}>
          Todos
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={(e) => setAll(e.currentTarget, 'none')}>
          Nenhum
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center">
        <label htmlFor="list_id" className="sr-only">
          Lista de destino
        </label>
        <Select
          id="list_id"
          name="list_id"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className={listId ? 'col-span-1 sm:w-52' : 'col-span-2 sm:w-40'}
        >
          <option value="">Nova lista</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        {listId ? null : (
          <>
            <label htmlFor="list_name" className="sr-only">
              Nome da nova lista
            </label>
            <Input id="list_name" name="list_name" maxLength={60} placeholder="Nome da lista" className="sm:w-48" />
          </>
        )}
        <SubmitButton size="sm" className="h-9">
          Adicionar
        </SubmitButton>
      </div>
    </div>
  )
}

export function AutoSubmitSelect(props: React.ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}

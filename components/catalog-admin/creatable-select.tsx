'use client'

import { useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Input, Select } from '@/components/ui/primitives'
import type { TaxonomyOptionGroup } from '@/lib/catalog/queries'
import { normalizeText } from '@/lib/catalog/taxonomy'

const CREATE = '__create__'

type Props = {
  id: string
  name: string
  groups: TaxonomyOptionGroup[]
  defaultValue?: string | null
  emptyLabel: string
  createLabel: string
  placeholder: string
}

export function CreatableSelect({ id, name, groups, defaultValue, emptyLabel, createLabel, placeholder }: Props) {
  const hintId = useId()
  const allOptions = useMemo(() => groups.flatMap((g) => g.options), [groups])
  const initial = defaultValue?.trim() ?? ''
  const initialMissing = initial !== '' && !allOptions.some((o) => normalizeText(o) === normalizeText(initial))

  const [value, setValue] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  const existing = useMemo(() => {
    const key = normalizeText(draft.trim())
    return key ? allOptions.find((o) => normalizeText(o) === key) ?? null : null
  }, [draft, allOptions])

  function selectChange(next: string) {
    if (next === CREATE) {
      setDraft('')
      setCreating(true)
      return
    }
    setValue(next)
  }

  function cancel() {
    setCreating(false)
    setDraft('')
  }

  if (creating) {
    return (
      <div className="flex flex-col gap-1.5">
        <input type="hidden" name={name} value={existing ?? draft.trim()} />
        <div className="flex gap-2">
          <Input
            id={id}
            autoFocus
            value={draft}
            maxLength={80}
            placeholder={placeholder}
            aria-describedby={existing ? hintId : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel()
            }}
          />
          <button
            type="button"
            onClick={cancel}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Voltar para a lista"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {existing ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            Já existe <strong className="font-medium text-foreground">{existing}</strong>. Vamos usar essa.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select id={id} value={value} onChange={(e) => selectChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {initialMissing ? (
          <optgroup label="Atual">
            <option value={initial}>{initial}</option>
          </optgroup>
        ) : null}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CREATE}>{`+ ${createLabel}`}</option>
      </Select>
    </>
  )
}

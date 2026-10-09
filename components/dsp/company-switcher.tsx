'use client'

import { useActionState, useRef } from 'react'
import { switchCompany } from '@/lib/actions/dsp-auth'

export function CompanySwitcher({ companies, current }: { companies: { id: string; name: string }[]; current: string }) {
  const [, action, pending] = useActionState(switchCompany, null)
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <form ref={formRef} action={action}>
      <label htmlFor="dsp-company" className="sr-only">
        Empresa
      </label>
      <select
        id="dsp-company"
        name="company_id"
        defaultValue={current}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className="-ml-1 max-w-56 cursor-pointer truncate rounded bg-transparent px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </form>
  )
}

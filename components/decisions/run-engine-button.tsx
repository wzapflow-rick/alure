'use client'

import { useActionState } from 'react'
import { RefreshCw } from 'lucide-react'
import { SubmitButton } from '@/components/forms/action-form'
import { runEngineAction } from '@/lib/actions/decisions'

export function RunEngineButton() {
  const [state, action] = useActionState(runEngineAction, null)
  return (
    <form action={action} className="flex flex-col items-start gap-1 md:items-end">
      <SubmitButton variant="secondary" size="sm">
        <RefreshCw className="size-3.5" aria-hidden />
        Rodar análise
      </SubmitButton>
      {state?.message ? (
        <span role="status" className={state.ok ? 'text-xs text-muted-foreground' : 'text-xs text-critical'}>
          {state.message}
        </span>
      ) : null}
    </form>
  )
}

'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import type { ActionState } from '@/lib/actions/shared'
import { cn } from '@/lib/utils'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  onSuccess?: () => void
}) {
  const [state, formAction] = useActionState(action, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset()
      onSuccess?.()
    }
  }, [state, resetOnSuccess, onSuccess])

  return (
    <form ref={formRef} action={formAction} className={cn('flex flex-col gap-4', className)}>
      {children}
      {state?.message ? (
        <p role="status" className={cn('text-sm', state.ok ? 'text-positive' : 'text-critical')}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

export function SubmitButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  )
}

/** Single-button form for quick mutations (accept, dismiss, toggle). */
export function InlineAction({
  action,
  fields,
  label,
  variant = 'ghost',
}: {
  action: Action
  fields: Record<string, string | number>
  label: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
      {state && !state.ok ? <span className="text-xs text-critical">{state.message}</span> : null}
    </form>
  )
}

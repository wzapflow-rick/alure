'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Input } from '@/components/ui/primitives'
import { signIn, signUp } from '@/lib/auth-client'

export function SignInForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '')
    const password = String(fd.get('password') ?? '')
    const res =
      mode === 'in'
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(fd.get('name') ?? '') })
    setPending(false)
    if (res.error) {
      setError(mode === 'in' ? 'E-mail ou senha inválidos.' : 'Não foi possível criar a conta.')
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === 'up' ? (
        <Field label="Nome" htmlFor="name">
          <Input id="name" name="name" required autoComplete="name" />
        </Field>
      ) : null}
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Senha" htmlFor="password" hint={mode === 'up' ? 'Mínimo de 8 caracteres.' : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        />
      </Field>
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in')
          setError(null)
        }}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === 'in' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
      </button>
    </form>
  )
}

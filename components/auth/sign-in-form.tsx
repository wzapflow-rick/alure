'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react'
import { signIn, signUp } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

type Mode = 'in' | 'up'

const MIN_PASSWORD = 10

const inputClass =
  'h-11 w-full rounded-lg border border-brand-line bg-brand-deep/60 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 disabled:opacity-60'

function describeError(mode: Mode, status: number | undefined, message: string | undefined) {
  if (mode === 'in') {
    if (status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
    return 'E-mail ou senha incorretos.'
  }
  if (status === 403) return 'Este e-mail não está autorizado. Ele precisa estar em ALURE_ALLOWED_EMAILS.'
  if (status === 422 || message?.toLowerCase().includes('exist'))
    return 'Já existe uma conta com este e-mail. Use a opção Entrar.'
  return message || 'Não foi possível criar a conta.'
}

export function SignInForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('in')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setError(null)

    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim().toLowerCase()
    const password = String(fd.get('password') ?? '')
    const name = String(fd.get('name') ?? '').trim()

    if (mode === 'up' && password.length < MIN_PASSWORD) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`)
      return
    }

    setPending(true)
    try {
      const res =
        mode === 'in' ? await signIn.email({ email, password }) : await signUp.email({ email, password, name })
      if (res.error) {
        setError(describeError(mode, res.error.status, res.error.message))
        setPending(false)
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('Sem conexão com o servidor. Verifique a internet e tente de novo.')
      setPending(false)
    }
  }

  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState('CapsLock'))
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Tipo de acesso" className="grid grid-cols-2 gap-1 rounded-lg bg-brand-deep/70 p-1">
        {(
          [
            ['in', 'Entrar'],
            ['up', 'Primeiro acesso'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => switchMode(value)}
            className={cn(
              'h-9 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50',
              mode === value ? 'bg-brand-line text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === 'up' ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-xs font-medium text-muted-foreground">
              Nome
            </label>
            <div className="relative">
              <User aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input id="name" name="name" required autoComplete="name" placeholder="Seu nome" disabled={pending} className={inputClass} />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            E-mail
          </label>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              placeholder="voce@empresa.com.br"
              disabled={pending}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
            Senha
          </label>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={mode === 'up' ? MIN_PASSWORD : undefined}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              placeholder={mode === 'up' ? `Mínimo de ${MIN_PASSWORD} caracteres` : 'Sua senha'}
              disabled={pending}
              onKeyUp={trackCaps}
              onKeyDown={trackCaps}
              onBlur={() => setCapsLock(false)}
              aria-describedby={capsLock ? 'caps-warning' : undefined}
              className={cn(inputClass, 'pr-11')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {capsLock ? (
            <p id="caps-warning" className="text-xs text-attention">
              Caps Lock está ativado.
            </p>
          ) : null}
        </div>

        <div aria-live="polite" className="min-h-0">
          {error ? (
            <p role="alert" className="rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-sm leading-relaxed text-critical">
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="group mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-teal text-sm font-semibold text-brand-teal-foreground transition-colors hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {mode === 'in' ? 'Entrando…' : 'Criando conta…'}
            </>
          ) : (
            <>
              {mode === 'in' ? 'Entrar' : 'Criar conta'}
              <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      {mode === 'up' ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Só e-mails autorizados pela equipe conseguem criar conta.
        </p>
      ) : null}
    </div>
  )
}

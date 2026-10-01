'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { signIn, signUp } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

type Mode = 'in' | 'up'

const MIN_PASSWORD = 10

const inputClass =
  'h-14 w-full rounded-lg border border-brand-line bg-brand-deep/50 px-4 text-[15px] text-foreground placeholder:text-muted-foreground/50 transition-colors hover:border-brand-line/100 hover:bg-brand-deep/70 focus:border-brand-teal focus:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-brand-teal/15 disabled:opacity-60'

const labelClass = 'text-sm font-medium text-foreground/80'

const linkClass =
  'rounded-sm font-medium text-brand-teal transition-colors hover:text-brand-teal/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50'

const COPY = {
  in: {
    title: 'Bem-vindo ao ALURE OS',
    subtitle: 'Seu centro de inteligência comercial.',
    submit: 'Entrar',
    pending: 'Entrando…',
  },
  up: {
    title: 'Ative seu acesso',
    subtitle: 'Crie sua senha com o e-mail autorizado pela equipe.',
    submit: 'Ativar acesso',
    pending: 'Ativando…',
  },
} as const

function describeError(mode: Mode, status: number | undefined, message: string | undefined) {
  if (mode === 'in') {
    if (status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
    return 'E-mail ou senha incorretos.'
  }
  if (status === 403) return 'Este e-mail não está autorizado. Peça ao administrador para liberá-lo.'
  if (status === 422 || message?.toLowerCase().includes('exist'))
    return 'Este e-mail já tem acesso ativo. Volte e use Entrar.'
  return message || 'Não foi possível ativar o acesso.'
}

export function SignInForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('in')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [showReset, setShowReset] = useState(false)

  const copy = COPY[mode]

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setShowReset(false)
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
    } catch {
      setError('Sem conexão com o servidor. Verifique a internet e tente de novo.')
      setPending(false)
    }
  }

  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState('CapsLock'))
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <Image src="/brand/symbol.png" alt="" width={432} height={496} priority className="h-7 w-auto" />
          <span className="font-mono text-xs tracking-[0.3em] text-foreground/70">ALURE OS</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{copy.title}</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{copy.subtitle}</p>
        </div>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate={false}>
        {mode === 'up' ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className={labelClass}>
              Nome
            </label>
            <input id="name" name="name" required autoComplete="name" placeholder="Como devemos te chamar" disabled={pending} className={inputClass} />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className={labelClass}>
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            placeholder="seu@email.com"
            disabled={pending}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className={labelClass}>
            Senha
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={mode === 'up' ? MIN_PASSWORD : undefined}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              placeholder={mode === 'up' ? `Mínimo de ${MIN_PASSWORD} caracteres` : 'Digite sua senha'}
              disabled={pending}
              onKeyUp={trackCaps}
              onKeyDown={trackCaps}
              onBlur={() => setCapsLock(false)}
              aria-describedby={capsLock ? 'caps-warning' : undefined}
              className={cn(inputClass, 'pr-14')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50"
            >
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>

          <div className="flex min-h-5 items-start justify-between gap-4">
            <p id="caps-warning" className={cn('text-xs text-attention', !capsLock && 'invisible')}>
              Caps Lock está ativado.
            </p>
            {mode === 'in' ? (
              <button
                type="button"
                onClick={() => setShowReset((v) => !v)}
                aria-expanded={showReset}
                aria-controls="reset-help"
                className={cn(linkClass, 'shrink-0 text-sm')}
              >
                Esqueceu sua senha?
              </button>
            ) : null}
          </div>

          {showReset && mode === 'in' ? (
            <p id="reset-help" className="rounded-lg border border-brand-line bg-brand-deep/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              Por segurança, a senha é redefinida pelo administrador do ALURE OS. Fale com ele para liberar um novo acesso.
            </p>
          ) : null}
        </div>

        <div aria-live="polite">
          {error ? (
            <p role="alert" className="rounded-lg border border-critical/30 bg-critical/10 px-4 py-3 text-sm leading-relaxed text-critical">
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-brand-teal text-[15px] font-semibold text-brand-teal-foreground shadow-[0_10px_32px_-14px_var(--brand-teal)] transition-all hover:bg-brand-teal/90 hover:shadow-[0_12px_36px_-12px_var(--brand-teal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {copy.pending}
            </>
          ) : (
            copy.submit
          )}
        </button>
      </form>

      <div className="border-t border-brand-line/70 pt-6 text-sm text-muted-foreground">
        {mode === 'in' ? (
          <p>
            Primeiro acesso?{' '}
            <button type="button" onClick={() => switchMode('up')} className={linkClass}>
              Ative seu acesso
            </button>
          </p>
        ) : (
          <button type="button" onClick={() => switchMode('in')} className={cn(linkClass, 'inline-flex items-center gap-2')}>
            <ArrowLeft aria-hidden className="size-4" />
            Já tenho acesso. Entrar
          </button>
        )}
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { LiquidGlassLogo } from '@/components/auth/liquid-glass-logo'
import { SignInForm } from '@/components/auth/sign-in-form'
import { SetupRequired } from '@/components/shell/setup-required'
import { getDbStatus } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar' }

export default async function SignInPage() {
  const status = await getDbStatus()
  if (status !== 'ready') return <SetupRequired status={status} />
  if (await getSessionUser()) redirect('/')

  return (
    <main className="flex min-h-dvh bg-brand-ink text-foreground">
      <BrandPanel />

      <section className="flex min-h-dvh flex-1 flex-col bg-brand-ink px-6 py-10 sm:px-10 md:w-[55%] md:flex-none lg:w-[45%]">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[420px] animate-rise">
            <SignInForm />
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-[420px] pt-10">
          <p className="text-xs tracking-wide text-muted-foreground/60">
            Ambiente interno <span aria-hidden>•</span> ALURE Design &amp; Acabamentos
          </p>
        </footer>
      </section>
    </main>
  )
}

function BrandPanel() {
  return (
    <section
      aria-label="ALURE Design & Acabamentos"
      className="relative hidden overflow-hidden border-r border-brand-line/60 bg-brand-deep md:flex md:w-[45%] lg:w-[55%]"
    >
      <Image
        src="/brand/arcs.jpg"
        alt=""
        fill
        priority
        sizes="55vw"
        className="object-cover object-right opacity-60"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-brand-deep via-brand-deep/70 to-brand-deep/20" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-deep/80 via-transparent to-brand-deep/40" />

      <div className="relative flex w-full flex-col items-center justify-center gap-10 px-10">
        <LiquidGlassLogo className="w-[clamp(260px,40%,370px)] animate-rise" />
        <p className="max-w-xs animate-rise text-center text-sm leading-relaxed text-foreground/60 text-pretty [animation-delay:120ms]">
          Inteligência comercial para decisões que realmente importam.
        </p>
      </div>

      <span className="absolute bottom-8 left-10 font-mono text-[11px] tracking-[0.3em] text-brand-teal/70">
        ALURE OS
      </span>
    </section>
  )
}

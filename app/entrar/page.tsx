import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
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
    <main className="flex min-h-dvh bg-brand-deep text-foreground">
      <section className="relative hidden flex-1 overflow-hidden border-r border-brand-line lg:flex">
        <Image
          src="/brand/wallpaper-hd.jpg"
          alt="ALURE Design & Acabamentos"
          fill
          priority
          sizes="55vw"
          className="object-cover object-center"
        />
        <div className="relative mt-auto flex w-full items-end justify-between gap-6 p-10">
          <p className="max-w-xs text-sm leading-relaxed text-foreground/70 text-pretty">
            Centro de comando comercial. Cada decisão de preço, estoque e campanha registrada com evidência.
          </p>
          <span className="font-mono text-xs tracking-widest text-brand-teal">ALURE OS</span>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center bg-brand-navy px-6 py-12 lg:max-w-xl">
        <div className="flex w-full max-w-sm flex-col gap-10">
          <header className="flex animate-rise flex-col gap-6">
            <Image
              src="/brand/icon.png"
              alt=""
              width={56}
              height={56}
              priority
              className="size-14 rounded-2xl ring-1 ring-brand-line"
            />
            <div className="flex flex-col gap-2">
              <span className="font-mono text-xs tracking-widest text-brand-teal">ALURE OS</span>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">Bem-vindo de volta.</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Entre com seu e-mail da equipe para abrir o centro de comando.
              </p>
            </div>
          </header>

          <div className="animate-rise [animation-delay:120ms]">
            <SignInForm />
          </div>

          <p className="animate-rise text-xs leading-relaxed text-muted-foreground/70 [animation-delay:240ms]">
            Acesso restrito à equipe ALURE Design &amp; Acabamentos.
          </p>
        </div>
      </section>
    </main>
  )
}

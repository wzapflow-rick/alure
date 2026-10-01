import type { Metadata } from 'next'
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
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs tracking-widest text-primary">ALURE OS</span>
          <h1 className="text-2xl font-semibold text-balance">Centro de comando</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">Acesso restrito à equipe.</p>
        </div>
        <SignInForm />
      </div>
    </main>
  )
}

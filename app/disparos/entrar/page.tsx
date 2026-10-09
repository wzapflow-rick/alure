import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Send } from 'lucide-react'
import { Field, Input, Panel } from '@/components/ui/primitives'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { bootstrapDspAdmin, loginDsp } from '@/lib/actions/dsp-auth'
import { dspSchemaReady, getDspUser, hasAnyDspUser } from '@/lib/dsp/session'
import { getSessionUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar · Disparos' }
export const dynamic = 'force-dynamic'

export default async function DspLoginPage() {
  const ready = await dspSchemaReady()
  if (ready && (await getDspUser())) redirect('/disparos')
  const firstAccess = ready && !(await hasAnyDspUser())
  const alureUser = firstAccess ? await getSessionUser().catch(() => null) : null

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
            <Send className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">Disparos</h1>
            <p className="text-sm text-muted-foreground">
              {firstAccess ? 'Primeiro acesso: crie o administrador.' : 'Entre com o acesso que o administrador criou para você.'}
            </p>
          </div>
        </div>

        <Panel>
          <div className="p-5">
            {!ready ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                As tabelas ainda não existem. Rode <code className="font-mono text-xs">db/021_disparos_multiempresa.sql</code> no pgAdmin e recarregue.
              </p>
            ) : firstAccess ? (
              alureUser ? (
                <ActionForm action={bootstrapDspAdmin}>
                  <Field label="Seu nome" htmlFor="name">
                    <Input id="name" name="name" required defaultValue={alureUser.name} autoComplete="name" />
                  </Field>
                  <Field label="E-mail" htmlFor="email">
                    <Input id="email" name="email" type="email" required defaultValue={alureUser.email} autoComplete="email" />
                  </Field>
                  <Field label="Senha dos Disparos" htmlFor="password" hint="Pelo menos 8 caracteres. Pode ser diferente da senha da ALURE.">
                    <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
                  </Field>
                  <SubmitButton>Criar administrador</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Para criar o primeiro administrador, entre antes no painel da ALURE neste navegador e depois volte para esta página.
                </p>
              )
            ) : (
              <ActionForm action={loginDsp}>
                <Field label="E-mail" htmlFor="email">
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </Field>
                <Field label="Senha" htmlFor="password">
                  <Input id="password" name="password" type="password" required autoComplete="current-password" />
                </Field>
                <SubmitButton>Entrar</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Panel>
      </div>
    </main>
  )
}

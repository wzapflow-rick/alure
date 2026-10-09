import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badges'
import { Field, Input, Panel, Select } from '@/components/ui/primitives'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { createCompany, createDspUser, resetDspPassword, setCompanyActive, setDspUserActive } from '@/lib/actions/dsp-admin'
import { formatDateTime } from '@/lib/broadcast/labels'
import { listCompanies, listDspUsers } from '@/lib/dsp/companies'
import { requireDspAdmin } from '@/lib/dsp/session'

export const metadata: Metadata = { title: 'Admin · Disparos' }

export default async function AdminPage() {
  const me = await requireDspAdmin()
  const [companies, users] = await Promise.all([listCompanies(), listDspUsers()])

  return (
    <>
      <Panel title="Empresas">
        <ul className="divide-y divide-border">
          {companies.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.active ? <Badge tone="positive">Ativa</Badge> : <Badge>Desativada</Badge>}
              <span className="text-sm text-muted-foreground tabular">
                {c.users} {c.users === 1 ? 'acesso' : 'acessos'} · {c.numbers} {c.numbers === 1 ? 'número' : 'números'}
              </span>
              {c.id !== '1' ? (
                <span className="ml-auto">
                  <InlineAction action={setCompanyActive} fields={{ id: c.id, active: String(!c.active) }} label={c.active ? 'Desativar' : 'Reativar'} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <ActionForm action={createCompany} className="flex-row flex-wrap items-end gap-3 border-t border-border p-4 sm:p-5" resetOnSuccess>
          <Field label="Nova empresa" htmlFor="company-name">
            <Input id="company-name" name="name" required minLength={2} maxLength={80} placeholder="Phoenix Pinturas" />
          </Field>
          <SubmitButton>Criar empresa</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel title="Acessos">
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 p-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-foreground">{u.name}</span>
                <span className="text-sm text-muted-foreground">{u.email}</span>
                {u.role === 'admin' ? <Badge tone="info">Admin · todas as empresas</Badge> : <Badge>{u.company_name ?? 'sem empresa'}</Badge>}
                {!u.active ? <Badge tone="critical">Bloqueado</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {u.last_login_at ? `Último acesso ${formatDateTime(u.last_login_at)}` : 'Nunca entrou'}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <ActionForm action={resetDspPassword} className="flex-row items-end gap-2" resetOnSuccess>
                  <input type="hidden" name="id" value={u.id} />
                  <Input name="password" type="password" minLength={8} required placeholder="Nova senha" aria-label={`Nova senha de ${u.email}`} autoComplete="new-password" className="max-w-48" />
                  <SubmitButton variant="secondary" size="sm">
                    Trocar senha
                  </SubmitButton>
                </ActionForm>
                {u.id !== me.id ? (
                  <InlineAction action={setDspUserActive} fields={{ id: u.id, active: String(!u.active) }} label={u.active ? 'Bloquear' : 'Desbloquear'} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Novo acesso">
        <ActionForm action={createDspUser} className="p-4 sm:p-5" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="u-name">
              <Input id="u-name" name="name" required maxLength={80} />
            </Field>
            <Field label="E-mail" htmlFor="u-email">
              <Input id="u-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Senha inicial" htmlFor="u-password" hint="Mínimo de 8 caracteres.">
              <Input id="u-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Empresa" htmlFor="u-company">
              <Select id="u-company" name="company_id" required defaultValue={companies.find((c) => c.id !== '1')?.id ?? companies[0]?.id}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Permissão" htmlFor="u-role" hint="Membro vê só a própria empresa. Admin vê todas e gerencia acessos.">
              <Select id="u-role" name="role" defaultValue="member">
                <option value="member">Membro</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
          <div>
            <SubmitButton>Criar acesso</SubmitButton>
          </div>
        </ActionForm>
      </Panel>
    </>
  )
}

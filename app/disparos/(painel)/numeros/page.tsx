import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, type Tone } from '@/components/ui/badges'
import { EmptyState, Field, Input, Panel } from '@/components/ui/primitives'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { createNumber, disconnectNumber, removeNumber, renameNumber, syncNumberWebhook } from '@/lib/actions/dsp-instances'
import { getInstance, listInstances } from '@/lib/dsp/instances'
import { requireDspUser } from '@/lib/dsp/session'
import { connectQr, connectionState, evolutionServerConfig, instanceOwner } from '@/lib/notify/evolution'
import { noteConnectionState } from '@/lib/broadcast/health'
import { formatPhone } from '@/lib/broadcast/text'

export const metadata: Metadata = { title: 'Números · Disparos' }

const STATE: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Conectado', tone: 'positive' },
  connecting: { label: 'Aguardando QR Code', tone: 'attention' },
  close: { label: 'Desconectado', tone: 'critical' },
  unknown: { label: 'Sem resposta', tone: 'neutral' },
}

export default async function NumbersPage({ searchParams }: { searchParams: Promise<{ qr?: string }> }) {
  const { qr } = await searchParams
  const user = await requireDspUser()
  const instances = await listInstances(user.companyId)
  const server = Boolean(evolutionServerConfig())

  const states = await Promise.all(
    instances.map(async (i) => {
      const state = server && i.evo ? await connectionState(i.evo).catch(() => 'unknown' as const) : 'unknown'
      if (state !== 'unknown') {
        await noteConnectionState({ companyId: user.companyId, instanceId: i.id }, state, 'tela de números').catch(() => {})
      }
      const phone = state === 'open' && !i.phone ? await instanceOwner(i.evo).catch(() => null) : i.phone
      return { ...i, state, phone }
    }),
  )

  const qrTarget = qr ? await getInstance(user.companyId, qr) : null
  const qrImage = qrTarget && server ? await connectQr(qrTarget.evo).catch(() => null) : null

  return (
    <>
      {qrTarget ? (
        <Panel title={`Conectar ${qrTarget.label}`} action={<Link href="/disparos/numeros" className="text-sm text-muted-foreground hover:text-foreground">Fechar</Link>}>
          <div className="flex flex-col items-center gap-4 p-5 text-center">
            {qrImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrImage} alt={`QR Code para conectar ${qrTarget.label}`} className="size-64 rounded-md bg-white p-2" />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum QR Code disponível. O número pode já estar conectado.</p>
            )}
            <p className="max-w-md text-sm text-muted-foreground">
              No celular, abra o WhatsApp → Aparelhos conectados → Conectar um aparelho e aponte para o código. O código expira em
              cerca de 40 segundos.
            </p>
            <Link href={`/disparos/numeros?qr=${qrTarget.id}`} className="text-sm font-medium text-primary hover:underline">
              Gerar novo QR Code
            </Link>
          </div>
        </Panel>
      ) : null}

      <Panel title="Números de WhatsApp">
        {states.length === 0 ? (
          <EmptyState title="Nenhum número ainda." description="Crie um número abaixo e leia o QR Code com o WhatsApp do aparelho." />
        ) : (
          <ul className="divide-y divide-border">
            {states.map((i) => {
              const s = STATE[i.state] ?? STATE.unknown
              return (
                <li key={i.id} className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-foreground">{i.label}</span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {i.paused_all ? <Badge tone="attention">Envios pausados</Badge> : null}
                    {i.quarantine_until && new Date(i.quarantine_until) > new Date() ? <Badge tone="critical">Quarentena</Badge> : null}
                    <span className="text-sm text-muted-foreground tabular">{i.phone ? formatPhone(i.phone) : 'sem número pareado'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {i.state !== 'open' ? (
                      <Link href={`/disparos/numeros?qr=${i.id}`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                        Conectar (QR Code)
                      </Link>
                    ) : null}
                    <Link href={`/disparos/protecoes?n=${i.id}`} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                      Proteções
                    </Link>
                    <InlineAction action={syncNumberWebhook} fields={{ id: i.id }} label="Configurar webhook" />
                    {i.state === 'open' ? <InlineAction action={disconnectNumber} fields={{ id: i.id }} label="Desconectar" /> : null}
                    {i.name ? <InlineAction action={removeNumber} fields={{ id: i.id }} label="Excluir" variant="danger" /> : null}
                  </div>
                  <ActionForm action={renameNumber} className="flex-row items-end gap-2">
                    <input type="hidden" name="id" value={i.id} />
                    <Input name="label" defaultValue={i.label} aria-label={`Nome de ${i.label}`} maxLength={60} className="max-w-xs" />
                    <SubmitButton variant="secondary" size="sm">
                      Renomear
                    </SubmitButton>
                  </ActionForm>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Novo número">
        {server ? (
          <ActionForm action={createNumber} className="p-4 sm:p-5" resetOnSuccess>
            <Field label="Nome do número" htmlFor="label" hint="Só para você identificar, ex.: Comercial, Prospecção 2.">
              <Input id="label" name="label" required minLength={2} maxLength={60} placeholder="Comercial" />
            </Field>
            <p className="text-sm text-muted-foreground">
              Números novos começam em aquecimento, com poucos envios por dia, e o limite sobe sozinho conforme as respostas.
            </p>
            <div>
              <SubmitButton>Criar número</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <EmptyState title="Evolution API não configurada." description="Defina EVOLUTION_API_URL e EVOLUTION_API_KEY (a chave global) nas variáveis do projeto." />
        )}
      </Panel>
    </>
  )
}

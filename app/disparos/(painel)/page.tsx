import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react'
import { Badge, Dot } from '@/components/ui/badges'
import { EmptyState, Panel, Section, Stat, buttonVariants } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { AutoRefresh } from '@/components/broadcast/auto-refresh'
import { setPauseAll } from '@/lib/actions/broadcast'
import { insideWindow, localClock } from '@/lib/broadcast/engine'
import { CAMPAIGN_STATUS, EVENT_LABEL, PAUSE_REASON, formatDateTime, relativeMinutes } from '@/lib/broadcast/labels'
import { contactStats, instanceSummary, listCampaigns, listEvents } from '@/lib/broadcast/queries'
import { WEEKDAY_LABELS, quarantineActive } from '@/lib/broadcast/settings'
import { listInstances } from '@/lib/dsp/instances'
import { requireDspUser } from '@/lib/dsp/session'
import { connectionState, evolutionServerConfig, type ConnectionState } from '@/lib/notify/evolution'

export const metadata: Metadata = { title: 'Disparos' }

const CONNECTION_LABEL: Record<ConnectionState, string> = { open: 'Conectado', connecting: 'Conectando', close: 'Desconectado', unknown: 'Sem resposta' }

export default async function BroadcastPage() {
  const user = await requireDspUser()
  const instances = await listInstances(user.companyId)
  const [summaries, states, contacts, campaigns, events] = await Promise.all([
    Promise.all(instances.map((i) => instanceSummary(i.id, i.label, i.phone))),
    Promise.all(instances.map((i) => connectionState(i.evo).catch(() => 'unknown' as const))),
    contactStats(user.companyId),
    listCampaigns(user.companyId),
    listEvents(user.companyId, { limit: 15 }),
  ])
  const configured = Boolean(evolutionServerConfig())
  const running = campaigns.some((c) => c.status === 'running')
  const sentToday = summaries.reduce((n, s) => n + s.counts.today, 0)
  const capToday = summaries.reduce((n, s) => n + s.dailyCap, 0)
  const clock = localClock()

  return (
    <>
      {running ? <AutoRefresh seconds={20} /> : null}

      <Section
        title="Números"
        action={
          <Link href="/disparos/numeros" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Smartphone className="size-4" aria-hidden /> Gerenciar números
          </Link>
        }
      >
        {summaries.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {summaries.map((sum, idx) => {
              const s = sum.settings
              const quarantined = quarantineActive(s)
              const state = states[idx]
              const tickAge = relativeMinutes(s.last_tick_at)
              const inWindow = insideWindow(s, clock)
              const blocked = s.paused_all || quarantined
              return (
                <Panel key={sum.id}>
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {blocked ? (
                          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden />
                        ) : (
                          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
                        )}
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="text-sm font-medium">{sum.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {quarantined
                              ? `Quarentena até ${formatDateTime(s.quarantine_until)}`
                              : s.paused_all
                                ? 'Envios pausados'
                                : inWindow
                                  ? 'Dentro da janela de envio'
                                  : `Fora da janela (${s.window_start_hour}h–${s.window_end_hour}h, ${s.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')})`}
                          </p>
                        </div>
                      </div>
                      <InlineAction
                        action={setPauseAll}
                        fields={{ instance_id: sum.id, paused: String(!s.paused_all) }}
                        label={s.paused_all ? 'Liberar' : 'Pausar'}
                        variant={s.paused_all ? 'primary' : 'danger'}
                      />
                    </div>
                    <div className="flex items-baseline justify-between text-xs text-muted-foreground tabular">
                      <span>
                        <span className="text-base font-semibold text-foreground">{sum.counts.today}</span>/{sum.dailyCap} hoje
                        {s.new_number ? ' · aquecendo' : ''}
                      </span>
                      <span>
                        {sum.counts.hour}/{sum.hourlyCap} na última hora
                      </span>
                    </div>
                    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Dot tone={!configured || state !== 'open' ? 'critical' : 'positive'} />
                        {configured ? CONNECTION_LABEL[state] : 'Evolution não configurada'}
                        {sum.phone ? ` · ${sum.phone}` : ''}
                      </li>
                      <li className="flex items-center gap-2">
                        <Dot tone={tickAge !== null && tickAge <= 3 ? 'positive' : 'attention'} />
                        Agendador: {tickAge === null ? 'nunca executou' : tickAge <= 3 ? 'ativo' : `há ${tickAge} min`}
                      </li>
                    </ul>
                  </div>
                </Panel>
              )
            })}
          </div>
        ) : (
          <Panel>
            <EmptyState title="Nenhum número conectado." description="Em Números, crie um número e leia o QR Code com o WhatsApp do aparelho." />
          </Panel>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Enviadas hoje" value={`${sentToday}/${capToday}`} hint="Soma dos números" tone={capToday && sentToday >= capToday ? 'attention' : undefined} />
        <Stat label="Contatos elegíveis" value={contacts.eligible} hint={`${contacts.total} na base`} />
        <Stat label="Descadastrados" value={contacts.opted_out} hint="Nunca recebem de novo" />
        <Stat label="Sem WhatsApp" value={contacts.invalid} hint="Ficam de fora" />
      </div>

      <Section
        title="Campanhas"
        action={
          instances.length ? (
            <Link href="/disparos/nova" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Plus className="size-4" aria-hidden /> Nova campanha
            </Link>
          ) : null
        }
      >
        <Panel>
          {campaigns.length ? (
            <ul className="divide-y divide-border">
              {campaigns.map((c) => {
                const done = c.sent + c.failed + c.skipped
                const pct = c.total ? Math.round((done / c.total) * 100) : 0
                return (
                  <li key={c.id}>
                    <Link href={`/disparos/${c.id}`} className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-2/50">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <Badge tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Badge>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground tabular">
                        {c.instance_label ? `${c.instance_label} · ` : ''}
                        {c.sent} enviadas · {c.replied} respostas · {c.failed} falhas · {c.pending} na fila de {c.total}
                        {c.status === 'paused' && c.pause_reason ? ` · ${PAUSE_REASON[c.pause_reason] ?? c.pause_reason}` : ''}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="Nenhuma campanha ainda." description="Conecte um número, importe contatos e crie a primeira campanha." />
          )}
        </Panel>
      </Section>

      <Section title="Registro de segurança" meta="Pausas, paradas e descadastros">
        <Panel>
          {events.length ? (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular">{formatDateTime(e.created_at)}</span>
                  <span className="text-sm">
                    <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                    {e.campaign ? <span className="text-muted-foreground"> · {e.campaign}</span> : null}
                    {e.detail ? <span className="block text-xs leading-relaxed text-muted-foreground">{e.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nada registrado ainda." />
          )}
        </Panel>
      </Section>
    </>
  )
}

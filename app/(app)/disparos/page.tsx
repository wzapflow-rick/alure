import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge, Dot } from '@/components/ui/badges'
import { EmptyState, Panel, Section, Stat, buttonVariants } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { AutoRefresh } from '@/components/broadcast/auto-refresh'
import { setPauseAll } from '@/lib/actions/broadcast'
import { insideWindow, localClock } from '@/lib/broadcast/engine'
import { CAMPAIGN_STATUS, EVENT_LABEL, PAUSE_REASON, formatDateTime, relativeMinutes } from '@/lib/broadcast/labels'
import { overview } from '@/lib/broadcast/queries'
import { WEEKDAY_LABELS } from '@/lib/broadcast/settings'
import { connectionState, evolutionConfig } from '@/lib/notify/evolution'

export const metadata: Metadata = { title: 'Disparos' }

const CONNECTION_LABEL = { open: 'Conectado', connecting: 'Conectando', close: 'Desconectado', unknown: 'Sem resposta' } as const

export default async function BroadcastPage() {
  const [data, connection] = await Promise.all([overview(), connectionState()])
  const { settings: s, counts, dailyCap, contacts, campaigns, events } = data
  const configured = Boolean(evolutionConfig())
  const running = campaigns.find((c) => c.status === 'running')
  const tickAge = relativeMinutes(s.last_tick_at)
  const schedulerOk = tickAge !== null && tickAge <= 3
  const inWindow = insideWindow(s, localClock())
  const warmingUp = s.warmup_enabled && dailyCap < s.daily_cap

  return (
    <>
      {running ? <AutoRefresh seconds={20} /> : null}

      <Panel>
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            {s.paused_all ? (
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden />
            ) : (
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
            )}
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {s.paused_all ? 'Todos os disparos estão pausados' : running ? `Enviando: ${running.name}` : 'Pronto para enviar'}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Janela {s.window_start_hour}h–{s.window_end_hour}h · {s.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}
                {inWindow ? ' · dentro da janela agora' : ' · fora da janela agora (nada é enviado)'}
              </p>
            </div>
          </div>
          <InlineAction
            action={setPauseAll}
            fields={{ paused: String(!s.paused_all) }}
            label={s.paused_all ? 'Liberar disparos' : 'Pausar tudo agora'}
            variant={s.paused_all ? 'primary' : 'danger'}
          />
        </div>
        <ul className="flex flex-col gap-2 border-t border-border px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          <li className="flex items-center gap-2">
            <Dot tone={!configured ? 'critical' : connection === 'open' ? 'positive' : 'critical'} />
            WhatsApp: {configured ? CONNECTION_LABEL[connection] : 'Evolution não configurada'}
          </li>
          <li className="flex items-center gap-2">
            <Dot tone={schedulerOk ? 'positive' : 'attention'} />
            Agendador: {tickAge === null ? 'nunca executou' : schedulerOk ? 'ativo' : `última execução há ${tickAge} min`}
          </li>
          {running?.next_send_at ? (
            <li className="flex items-center gap-2">
              <Dot tone="info" /> Próximo envio: {formatDateTime(running.next_send_at)}
            </li>
          ) : null}
        </ul>
      </Panel>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat
          label="Enviadas hoje"
          value={`${counts.today}/${dailyCap}`}
          hint={warmingUp ? `Aquecendo: dia ${(s.warmup_days ?? 0) + 1}` : 'Limite diário'}
          tone={counts.today >= dailyCap ? 'attention' : undefined}
        />
        <Stat label="Última hora" value={`${counts.hour}/${s.hourly_cap}`} hint="Limite por hora" tone={counts.hour >= s.hourly_cap ? 'attention' : undefined} />
        <Stat label="Contatos elegíveis" value={contacts.eligible} hint={`${contacts.total} na base`} />
        <Stat label="Descadastrados" value={contacts.opted_out} hint={`${contacts.invalid} sem WhatsApp`} />
      </div>

      <Section
        title="Campanhas"
        action={
          <Link href="/disparos/nova" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Plus className="size-4" aria-hidden /> Nova campanha
          </Link>
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
                        {c.sent} enviadas · {c.replied} respostas · {c.failed} falhas · {c.pending} na fila de {c.total}
                        {c.status === 'paused' && c.pause_reason ? ` · ${PAUSE_REASON[c.pause_reason] ?? c.pause_reason}` : ''}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma campanha ainda."
              description="Importe seus contatos em Contatos, confira as Proteções e crie a primeira campanha com o link do catálogo."
            />
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

      <Section title="Configuração do envio">
        <Panel>
          <div className="flex flex-col gap-3 p-5 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Agendador (obrigatório):</span> no cron-job.org, crie uma tarefa{' '}
              <span className="font-medium text-foreground">a cada 1 minuto</span> chamando{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground">/api/cron/disparos?key=CRON_SECRET</code>. Cada execução respeita os
              intervalos sorteados, então chamar a cada minuto não acelera os envios.
            </p>
            <p>
              <span className="font-medium text-foreground">Descadastro automático (recomendado):</span> na Evolution, ative o webhook do evento{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground">MESSAGES_UPSERT</code> apontando para{' '}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground">/api/webhooks/evolution?key=CRON_SECRET</code>. Quem responder SAIR
              sai de todas as campanhas na hora, e as respostas entram nas métricas.
            </p>
          </div>
        </Panel>
      </Section>
    </>
  )
}

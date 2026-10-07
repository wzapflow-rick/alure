import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badges'
import { Disclosure, EmptyState, Field, Input, Panel, Section, Stat } from '@/components/ui/primitives'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { AutoRefresh } from '@/components/broadcast/auto-refresh'
import { cancelCampaign, pauseCampaignAction, sendCampaignTest, startCampaign } from '@/lib/actions/broadcast'
import { CAMPAIGN_STATUS, EVENT_LABEL, MESSAGE_STATUS, PAUSE_REASON, SKIP_REASON, formatDateTime } from '@/lib/broadcast/labels'
import { campaignDetail, getCampaign } from '@/lib/broadcast/queries'
import { formatPhone } from '@/lib/broadcast/text'

export const metadata: Metadata = { title: 'Campanha · Disparos' }

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await getCampaign(id)
  if (!campaign) notFound()
  const { skips, recent, events } = await campaignDetail(id)
  const status = CAMPAIGN_STATUS[campaign.status]
  const replyRate = campaign.sent ? Math.round((campaign.replied / campaign.sent) * 100) : 0
  const editable = campaign.status === 'draft' || campaign.status === 'paused' || campaign.status === 'running'

  return (
    <>
      {campaign.status === 'running' ? <AutoRefresh seconds={15} /> : null}

      <Panel>
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{campaign.name}</h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {campaign.status === 'paused' && campaign.pause_reason ? `${PAUSE_REASON[campaign.pause_reason] ?? campaign.pause_reason} · ` : ''}
              {campaign.status === 'running' && campaign.next_send_at ? `Próximo envio: ${formatDateTime(campaign.next_send_at)} · ` : ''}
              {campaign.templates.length} variações{campaign.tag_filter ? ` · público: ${campaign.tag_filter}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {campaign.status === 'draft' || campaign.status === 'paused' ? (
              <InlineAction action={startCampaign} fields={{ id }} label={campaign.status === 'draft' ? 'Iniciar envio' : 'Retomar'} variant="primary" />
            ) : null}
            {campaign.status === 'running' ? <InlineAction action={pauseCampaignAction} fields={{ id }} label="Pausar" variant="secondary" /> : null}
            {editable ? <InlineAction action={cancelCampaign} fields={{ id }} label="Cancelar" variant="danger" /> : null}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
        <Stat label="Enviadas" value={campaign.sent} hint={`de ${campaign.total}`} />
        <Stat label="Na fila" value={campaign.pending} />
        <Stat label="Respostas" value={campaign.replied} hint={`${replyRate}% das enviadas`} tone={replyRate >= 5 ? 'positive' : undefined} />
        <Stat label="Falhas" value={campaign.failed} tone={campaign.failed ? 'critical' : undefined} />
        <Stat label="Puladas" value={campaign.skipped} />
        {campaign.two_step ? (
          <Stat label="Ofertas enviadas" value={campaign.offers_sent} hint={campaign.offers_pending ? `${campaign.offers_pending} aguardando` : 'só para quem respondeu'} />
        ) : null}
      </div>

      {campaign.status === 'draft' || campaign.status === 'paused' ? (
        <Panel title="Enviar teste para você">
          <ActionForm action={sendCampaignTest} className="p-5">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Seu WhatsApp" htmlFor="test-phone">
                <Input id="test-phone" name="phone" required inputMode="tel" placeholder="(11) 99999-9999" />
              </Field>
              <Field label="Nome no teste" htmlFor="test-name">
                <Input id="test-name" name="name" placeholder="Seu nome" />
              </Field>
              <SubmitButton variant="secondary">Enviar teste</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {skips.length ? (
        <Section title="Contatos pulados" meta="Protegidos automaticamente">
          <ul className="flex flex-wrap gap-2">
            {skips.map((s) => (
              <li key={s.reason}>
                <Badge>
                  {SKIP_REASON[s.reason] ?? s.reason}: {s.n}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Últimos envios">
        <Panel>
          {recent.length ? (
            <ul className="divide-y divide-border">
              {recent.map((m) => (
                <li key={m.id} className="flex flex-col gap-1.5 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{m.name ?? formatPhone(m.phone)}</span>
                    {m.name ? <span className="font-mono text-xs text-muted-foreground">{formatPhone(m.phone)}</span> : null}
                    <Badge tone={MESSAGE_STATUS[m.status]?.tone ?? 'neutral'}>{MESSAGE_STATUS[m.status]?.label ?? m.status}</Badge>
                    {m.replied ? <Badge tone="positive">Respondeu</Badge> : null}
                    <span className="ml-auto text-xs text-muted-foreground tabular">{formatDateTime(m.at)}</span>
                  </div>
                  {m.skip_reason ? <p className="text-xs text-muted-foreground">{SKIP_REASON[m.skip_reason] ?? m.skip_reason}</p> : null}
                  {m.error ? <p className="text-xs text-critical">{m.error}</p> : null}
                  {m.rendered ? (
                    <Disclosure summary="Ver mensagem">
                      <p className="whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-relaxed">{m.rendered}</p>
                    </Disclosure>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum envio ainda." description="Depois de iniciar, o primeiro envio sai em até 2 minutos dentro da janela permitida." />
          )}
        </Panel>
      </Section>

      <Section title="Variações">
        <div className="grid gap-3 md:grid-cols-2">
          {campaign.templates.map((t, i) => (
            <Panel key={i}>
              <p className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-muted-foreground">{t}</p>
            </Panel>
          ))}
        </div>
      </Section>

      {events.length ? (
        <Section title="Histórico">
          <Panel>
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular">{formatDateTime(e.created_at)}</span>
                  <span className="text-sm">
                    <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                    {e.detail ? <span className="block text-xs leading-relaxed text-muted-foreground">{e.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      ) : null}
    </>
  )
}

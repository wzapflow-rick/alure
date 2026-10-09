import type { Metadata } from 'next'
import { Field, Input, Panel } from '@/components/ui/primitives'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { saveProtectionSettings } from '@/lib/actions/broadcast'
import { loadSettings } from '@/lib/broadcast/queries'
import { WEEKDAY_LABELS, baseDailyCap, effectiveDailyCap, hourlyCeiling, quarantineActive } from '@/lib/broadcast/settings'
import { listIncidents, replyTrackingActive } from '@/lib/broadcast/health'
import { formatDateTime } from '@/lib/broadcast/labels'
import { EmptyState } from '@/components/ui/primitives'
import { NumberPicker } from '@/components/dsp/number-picker'
import { listInstances } from '@/lib/dsp/instances'
import { requireDspUser } from '@/lib/dsp/session'

export const metadata: Metadata = { title: 'Proteções · Disparos' }

function NumberField({ name, label, value, min, max, hint, unit }: { name: string; label: string; value: number; min: number; max: number; hint?: string; unit?: string }) {
  return (
    <Field label={unit ? `${label} (${unit})` : label} htmlFor={name} hint={hint ?? `Entre ${min} e ${max}.`}>
      <Input id={name} name={name} type="number" required min={min} max={max} defaultValue={value} className="tabular" />
    </Field>
  )
}

function Group({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-border px-5 py-5 first:border-t-0">
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  )
}

export default async function ProtectionsPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const user = await requireDspUser()
  const instances = await listInstances(user.companyId)
  const { n } = await searchParams
  const current = instances.find((i) => i.id === n) ?? instances[0]
  if (!current) {
    return (
      <Panel>
        <EmptyState title="Nenhum número ainda." description="Crie um número em Números para configurar as proteções dele." />
      </Panel>
    )
  }
  const s = await loadSettings(current.id)
  const [incidents, tracking] = await Promise.all([listIncidents(current.id, 5), replyTrackingActive(current.id).catch(() => false)])
  const cap = effectiveDailyCap(s)
  const perHourMax = Math.min(hourlyCeiling(s, cap), Math.floor(3600 / s.min_delay_s))
  const quarantined = quarantineActive(s)

  return (
    <>
    <NumberPicker instances={instances} current={current.id} basePath="/disparos/protecoes" />
    <Panel title={`Barreiras de proteção · ${current.label}`} action={<span className="text-xs text-muted-foreground tabular">Hoje: até {cap} envios · no máximo {perHourMax}/h</span>}>
      <ActionForm action={saveProtectionSettings} className="gap-0">
        <input type="hidden" name="instance_id" value={current.id} />
        <Group
          title="Ritmo entre mensagens"
          description="Cada envio espera um tempo sorteado entre o mínimo e o máximo, nunca um intervalo fixo. De vez em quando entra uma pausa extra de 3 a 10 minutos, como alguém que parou para fazer outra coisa."
        >
          <NumberField name="min_delay_s" label="Intervalo mínimo" unit="seg" value={s.min_delay_s} min={30} max={900} />
          <NumberField name="max_delay_s" label="Intervalo máximo" unit="seg" value={s.max_delay_s} min={45} max={1800} hint="Pelo menos 15s acima do mínimo." />
          <NumberField name="long_break_chance" label="Chance de pausa longa" unit="%" value={s.long_break_chance} min={0} max={20} />
        </Group>

        <Group
          title="Lotes"
          description="Depois de um lote (tamanho sorteado a cada vez), o envio para por um tempo longo e também sorteado."
        >
          <NumberField name="batch_min" label="Lote mínimo" unit="msgs" value={s.batch_min} min={3} max={50} />
          <NumberField name="batch_max" label="Lote máximo" unit="msgs" value={s.batch_max} min={3} max={60} />
          <div className="hidden lg:block" aria-hidden />
          <NumberField name="batch_pause_min_s" label="Pausa mínima após o lote" unit="seg" value={s.batch_pause_min_s} min={300} max={7200} hint="Mínimo de 5 minutos." />
          <NumberField name="batch_pause_max_s" label="Pausa máxima após o lote" unit="seg" value={s.batch_pause_max_s} min={300} max={10800} />
        </Group>

        <Group title="Limites" description="Tetos rígidos. Ao atingir um deles, o envio para e continua na próxima hora ou no próximo dia.">
          <NumberField name="hourly_cap" label="Máximo por hora" value={s.hourly_cap} min={1} max={60} />
          <NumberField name="daily_cap" label="Máximo por dia" value={s.daily_cap} min={1} max={400} hint="Teto final depois do aquecimento. Máximo 400." />
          <NumberField name="contact_cooldown_days" label="Intervalo por contato" unit="dias" value={s.contact_cooldown_days} min={1} max={365} hint="A mesma pessoa não recebe de novo antes disso." />
        </Group>

        <Group
          title="Aquecimento por mérito"
          description="O limite não sobe mais pelo calendário. Ele só aumenta depois de um dia que usou pelo menos 70% do limite, teve respostas e nenhum incidente. Cada aumento é de no máximo 25%. Dias com poucas respostas ou muitos descadastros seguram ou reduzem o limite. O total de cada dia varia entre 85% e 100% do limite, para não repetir o mesmo número sempre."
        >
          <label className="flex items-center gap-2.5 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" name="warmup_enabled" defaultChecked={s.warmup_enabled} className="accent-primary" />
            Aquecimento ativo
            <span className="text-xs text-muted-foreground tabular">· limite conquistado: {baseDailyCap(s)} · hoje: até {cap}</span>
          </label>
          <NumberField name="warmup_start" label="Limite inicial" value={s.warmup_start} min={5} max={100} />
          <NumberField name="warmup_step" label="Aumento máximo por dia saudável" value={s.warmup_step} min={0} max={50} />
          <NumberField
            name="min_reply_rate"
            label="Taxa mínima de resposta"
            unit="%"
            value={s.min_reply_rate}
            min={0}
            max={50}
            hint="Abaixo disso o limite não sobe, e a campanha pausa após 30 envios sem retorno. 0 desliga."
          />
          {!tracking ? (
            <p className="text-xs leading-relaxed text-attention sm:col-span-2 lg:col-span-3">
              Nenhuma resposta registrada nos últimos 30 dias. Confira se o webhook da Evolution envia o evento MESSAGES_UPSERT para /api/webhooks/evolution. Sem ele, a regra de respostas fica desligada.
            </p>
          ) : null}
        </Group>

        <Group
          title="Incidentes e quarentena"
          description="Se o WhatsApp desconectar ou a Evolution der sinal de bloqueio, isso conta como incidente: o limite é cortado, tudo pausa e o número fica em quarentena. Voltar a enviar logo depois de reconectar é o que transforma um aviso em banimento."
        >
          <NumberField name="quarantine_hours" label="Quarentena" unit="horas" value={s.quarantine_hours} min={24} max={336} hint="Mínimo 24h. Recomendado 72h." />
          <NumberField name="incident_cut_pct" label="Corte do limite" unit="%" value={s.incident_cut_pct} min={25} max={90} hint="Quanto o limite cai a cada incidente." />
          <div className="flex flex-col gap-2 text-xs leading-relaxed sm:col-span-2 lg:col-span-3">
            <p className={quarantined ? 'font-medium text-critical' : 'text-muted-foreground'}>
              {quarantined ? `Em quarentena até ${formatDateTime(s.quarantine_until)}. Nenhum envio sai até lá.` : 'Sem quarentena ativa.'}
            </p>
            {incidents.length ? (
              <ul className="flex flex-col gap-1.5 text-muted-foreground">
                {incidents.map((i) => (
                  <li key={i.id} className="tabular">
                    {formatDateTime(i.created_at)} · {i.kind === 'desconexao' ? 'Desconexão' : 'Sinal de bloqueio'} · limite {i.ramp_before} → {i.ramp_after}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Group>

        <Group
          title="Listas frias"
          description="Contato frio é quem nunca respondeu e nunca comprou (por exemplo, os da Prospecção). Eles geram a maioria das denúncias, então recebem um tratamento mais lento e restrito."
        >
          <NumberField
            name="cold_share_pct"
            label="Parte do dia para frios"
            unit="%"
            value={s.cold_share_pct}
            min={10}
            max={100}
            hint="Do limite diário. O resto fica para quem já conversou com a ALURE."
          />
          <NumberField
            name="cold_delay_pct"
            label="Intervalo extra para frios"
            unit="%"
            value={s.cold_delay_pct}
            min={0}
            max={300}
            hint="Somado ao intervalo normal entre mensagens."
          />
          <label className="flex items-start gap-2.5 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" name="cold_require_two_step" defaultChecked={s.cold_require_two_step} className="mt-0.5 accent-primary" />
            <span>
              Frios só em campanhas de duas etapas
              <span className="block text-xs text-muted-foreground">
                Em campanha comum, o contato frio é pulado. A primeira mensagem para um desconhecido nunca leva link.
              </span>
            </span>
          </label>
        </Group>

        <Group title="Janela de envio" description="Só envia em horário comercial (horário de Brasília) e nos dias marcados.">
          <NumberField name="window_start_hour" label="Começa às" unit="h" value={s.window_start_hour} min={8} max={20} />
          <NumberField name="window_end_hour" label="Termina às" unit="h" value={s.window_end_hour} min={9} max={21} />
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium text-muted-foreground">Dias da semana</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, i) => (
                <label key={label} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-primary/10">
                  <input type="checkbox" name="weekdays" value={i} defaultChecked={s.weekdays.includes(i)} className="accent-primary" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Disjuntores automáticos" description="A campanha pausa sozinha diante de sinais de risco. Se a Evolution indicar desconexão ou bloqueio, todos os disparos param até você liberar.">
          <NumberField name="max_consecutive_failures" label="Falhas seguidas" value={s.max_consecutive_failures} min={1} max={10} />
          <NumberField name="max_error_rate" label="Taxa de erro máxima" unit="%" value={s.max_error_rate} min={5} max={50} hint="Nas últimas 20 tentativas." />
          <NumberField name="max_invalid_rate" label="Números sem WhatsApp" unit="%" value={s.max_invalid_rate} min={10} max={60} hint="Lista ruim é sinal de spam para o WhatsApp." />
        </Group>

        <Group title="Comportamento humano" description="Antes de cada mensagem o WhatsApp mostra “digitando…” por um tempo proporcional ao tamanho do texto. Quem responde com estas palavras é descadastrado na hora.">
          <label className="flex items-center gap-2.5 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" name="typing_enabled" defaultChecked={s.typing_enabled} className="accent-primary" />
            Simular digitação
          </label>
          <Field label="Palavras de descadastro" htmlFor="opt_out_keywords" hint="Separadas por vírgula." className="sm:col-span-2">
            <Input id="opt_out_keywords" name="opt_out_keywords" defaultValue={s.opt_out_keywords.join(', ')} />
          </Field>
        </Group>

        <div className="flex flex-col gap-1 border-t border-border px-5 py-4">
          <ul className="mb-3 flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
            <li>Sempre ativo, sem configuração: uma campanha por vez, ordem aleatória de contatos, variação diferente da anterior a cada envio, conferência do número antes de enviar e nada de reenviar mensagem interrompida.</li>
            <li>Nenhum texto idêntico é enviado duas vezes em 14 dias. Respostas negativas (&quot;spam&quot;, &quot;não quero&quot;, &quot;quem é você&quot;) bloqueiam o contato para sempre. Antes de mandar a oferta, a mensagem do contato é marcada como lida.</li>
          </ul>
          <SubmitButton className="self-start">Salvar proteções</SubmitButton>
        </div>
      </ActionForm>
    </Panel>
    </>
  )
}

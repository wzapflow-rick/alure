import { Badge } from '@/components/ui/badges'
import { Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { ReminderForm } from '@/components/settings/reminder-form'
import { deleteReminder, runNotificationsNow, sendTestNotification, toggleReminder } from '@/lib/actions/notifications'
import { pool } from '@/lib/db'
import { connectionState, evolutionConfig, listGroups, type WhatsAppGroup } from '@/lib/notify/evolution'
import { formatDateTime } from '@/lib/format'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const KIND_LABEL: Record<string, string> = { stock: 'Estoque', opportunity: 'Oportunidade', reminder: 'Lembrete', test: 'Teste' }

type Reminder = { id: string; title: string; message: string | null; weekdays: number[]; hour: number; active: boolean }
type LogRow = { id: string; kind: string; status: string; error: string | null; created_at: Date; message: string }

async function loadData() {
  const { rows } = await pool.query<{ ok: boolean }>(`SELECT to_regclass('public.notification_log') IS NOT NULL AS ok`)
  if (!rows[0]?.ok) return null
  const [reminders, logs] = await Promise.all([
    pool.query<Reminder>(`SELECT id, title, message, weekdays, hour, active FROM notification_reminders ORDER BY hour, id`),
    pool.query<LogRow>(
      `SELECT id, kind, status, error, created_at, message FROM notification_log
        WHERE dedupe_key NOT LIKE 'rec:%' ORDER BY created_at DESC LIMIT 10`,
    ),
  ])
  return { reminders: reminders.rows, logs: logs.rows }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export async function NotificationsPanel() {
  const cfg = evolutionConfig()
  const [data, state] = await Promise.all([loadData().catch(() => null), connectionState()])
  const connected = state === 'open'
  let groups: WhatsAppGroup[] = []
  let groupsError: string | null = null
  if (cfg && !cfg.groupJid && connected) {
    groups = await listGroups().catch((err: Error) => {
      groupsError = err.message
      return []
    })
  }
  const ready = Boolean(cfg?.groupJid) && connected

  return (
    <Panel
      title="Avisos no WhatsApp"
      action={
        ready ? (
          <div className="flex items-center gap-2">
            <InlineAction action={sendTestNotification} fields={{}} label="Enviar teste" variant="secondary" />
            <InlineAction action={runNotificationsNow} fields={{}} label="Verificar agora" variant="secondary" />
          </div>
        ) : null
      }
    >
      <dl className="grid gap-px border-b border-border bg-border md:grid-cols-3">
        <Row label="Evolution API">
          {!cfg ? (
            <Badge tone="attention">Faltam EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE</Badge>
          ) : connected ? (
            <Badge tone="positive">Conectada · {cfg.instance}</Badge>
          ) : state === 'connecting' ? (
            <Badge tone="attention">Conectando · {cfg.instance}</Badge>
          ) : state === 'close' ? (
            <Badge tone="critical">WhatsApp desconectado · leia o QR code no painel da Evolution</Badge>
          ) : (
            <Badge tone="critical">Sem resposta da Evolution · confira URL e API key</Badge>
          )}
        </Row>
        <Row label="Grupo (WHATSAPP_GROUP_JID)">
          {cfg?.groupJid ? (
            <span className="font-mono text-xs">{cfg.groupJid}</span>
          ) : cfg?.groupJidInvalid ? (
            <Badge tone="critical">Formato inválido · precisa terminar em @g.us</Badge>
          ) : (
            <Badge tone="attention">Não definido</Badge>
          )}
        </Row>
        <Row label="Agendamento">
          {process.env.CRON_SECRET ? (
            <span className="text-muted-foreground">A cada 30 min, das 7h às 22h, via /api/cron/alerts</span>
          ) : (
            <Badge tone="critical">Falta CRON_SECRET</Badge>
          )}
        </Row>
      </dl>

      {cfg && !cfg.groupJid ? (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {connected
              ? 'Copie o ID do grupo da operação e salve em WHATSAPP_GROUP_JID (Configurações → Vars).'
              : 'Conecte o WhatsApp da instância para listar os grupos aqui e copiar o ID correto.'}
          </p>
          {groupsError ? <p className="text-sm text-critical">Não consegui listar os grupos: {groupsError}</p> : null}
          {groups.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                  <span>{g.subject}</span>
                  <code className="select-all font-mono text-xs text-muted-foreground">{g.id}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-b border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="text-foreground">Estoque:</span> aviso 1 com 15 un, aviso 2 com 10 un e aviso 3 (urgente) com 5 un ou menos.
          Cada nível é avisado uma vez por anúncio e volta a valer depois da reposição.
        </p>
        <p>
          <span className="text-foreground">Oportunidades:</span> novas prioridades comerciais do motor, em um único resumo.
        </p>
      </div>

      {data ? (
        <>
          <div className="border-b border-border">
            <h3 className="px-5 pt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Lembretes recorrentes</h3>
            {data.reminders.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.reminders.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className={`text-sm ${r.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{r.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.weekdays.map((d) => DAYS[d]).join(', ')} · {String(r.hour).padStart(2, '0')}:00
                        {r.message ? ` · ${r.message}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <InlineAction action={toggleReminder} fields={{ id: r.id }} label={r.active ? 'Pausar' : 'Ativar'} />
                      <InlineAction action={deleteReminder} fields={{ id: r.id }} label="Excluir" variant="danger" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-3 text-sm text-muted-foreground">Nenhum lembrete.</p>
            )}
            <ReminderForm />
          </div>

          <div>
            <h3 className="px-5 pt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Últimos envios</h3>
            {data.logs.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.logs.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 px-5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone={l.status === 'sent' ? 'positive' : 'critical'}>{l.status === 'sent' ? 'Enviado' : 'Erro'}</Badge>
                      <span>{KIND_LABEL[l.kind] ?? l.kind}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
                    </div>
                    {l.error ? <p className="text-xs text-critical">{l.error}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-3 pb-4 text-sm text-muted-foreground">Nenhum envio ainda.</p>
            )}
          </div>
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-attention">
          Rode o script <span className="font-mono">db/006_notifications.sql</span> no pgAdmin para ativar lembretes e histórico.
        </p>
      )}
    </Panel>
  )
}

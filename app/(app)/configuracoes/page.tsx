import type { Metadata } from 'next'
import { Badge, type Tone } from '@/components/ui/badges'
import { EmptyState, PageHeader, Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { EngineSettingsForm, FeeRuleForm } from '@/components/settings/settings-forms'
import { toggleFeeRule } from '@/lib/actions/products'
import { disconnectIntegration, syncNow } from '@/lib/actions/integrations'
import { ADAPTERS } from '@/lib/integrations/adapters'
import { CAPABILITY_LABELS, type Capability, type CapabilityStatus } from '@/lib/integrations/types'
import { formatBRL, formatDate, formatDateTime, formatPct, todayISO } from '@/lib/format'
import { getConnections, listAuditLogs, listFeeRules, listMarketplaces } from '@/lib/queries'
import { getEngineSettings } from '@/lib/settings'
import { AIPanel } from '@/components/settings/ai-panel'
import { NotificationsPanel } from '@/components/settings/notifications-panel'

export const metadata: Metadata = { title: 'Configurações' }

const CAP_TONE: Record<CapabilityStatus, Tone> = {
  VERIFIED: 'positive',
  'NEEDS VERIFICATION': 'attention',
  'NOT AVAILABLE': 'critical',
  'NOT IMPLEMENTED': 'neutral',
}

const ML_MESSAGES: Record<string, { tone: Tone; text: string }> = {
  connected: { tone: 'positive', text: 'Mercado Livre conectado. Clique em "Sincronizar 30 dias" para importar.' },
  denied: { tone: 'attention', text: 'Autorização cancelada no Mercado Livre.' },
  invalid_state: { tone: 'critical', text: 'Sessão de autorização inválida ou expirada. Tente conectar de novo.' },
  missing_env: { tone: 'attention', text: 'Faltam as credenciais MELI_CLIENT_ID, MELI_CLIENT_SECRET e MELI_REDIRECT_URI.' },
  missing_key: { tone: 'critical', text: 'Falta a variável TOKEN_ENCRYPTION_KEY (mínimo 32 caracteres) no projeto da Vercel. Adicione e faça um novo deploy.' },
  error: { tone: 'critical', text: 'Falha ao trocar o código por token. Confira o Redirect URI cadastrado no app do Mercado Livre.' },
}

const SHOPEE_MESSAGES: Record<string, { tone: Tone; text: string }> = {
  connected: { tone: 'positive', text: 'Shopee conectada. Clique em "Sincronizar 30 dias" para importar.' },
  denied: { tone: 'attention', text: 'Autorização cancelada na Shopee.' },
  invalid_state: { tone: 'critical', text: 'Sessão de autorização inválida ou expirada. Tente conectar de novo.' },
  missing_env: { tone: 'attention', text: 'Faltam as credenciais SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY e SHOPEE_REDIRECT_URI.' },
  error: { tone: 'critical', text: 'Falha ao trocar o código por token. Confira o Partner ID/Key e o Redirect URL do app na Shopee.' },
}

const CONNECT_ROUTES: Record<string, { href: string; label: string }> = {
  mercado_livre: { href: '/api/integrations/mercado-livre/connect', label: 'Conectar Mercado Livre' },
  shopee: { href: '/api/integrations/shopee/connect', label: 'Conectar Shopee' },
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ml?: string; shopee?: string }> }) {
  const { ml, shopee } = await searchParams
  const banners = [
    ml && ML_MESSAGES[ml] ? { name: 'Mercado Livre', ...ML_MESSAGES[ml] } : null,
    shopee && SHOPEE_MESSAGES[shopee] ? { name: 'Shopee', ...SHOPEE_MESSAGES[shopee] } : null,
  ].filter((b) => b !== null)
  const [settings, rules, marketplaces, connections, logs] = await Promise.all([
    getEngineSettings(),
    listFeeRules(),
    listMarketplaces(),
    getConnections(),
    listAuditLogs(50),
  ])

  return (
    <>
      <PageHeader title="Configurações" description="Parâmetros do motor, taxas, integrações e auditoria." />

      <AIPanel />

      <NotificationsPanel />

      <Panel title="Parâmetros do motor de decisão">
        <div className="px-5 py-5">
          <EngineSettingsForm values={settings} />
        </div>
      </Panel>

      <Panel title="Regras de taxa">
        <div className="flex flex-col">
          {rules.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-normal">Regra</th>
                    <th scope="col" className="px-5 py-2 font-normal">Faixa</th>
                    <th scope="col" className="px-5 py-2 text-right font-normal">Comissão</th>
                    <th scope="col" className="px-5 py-2 text-right font-normal">Fixa</th>
                    <th scope="col" className="px-5 py-2 font-normal">Vigência</th>
                    <th scope="col" className="px-5 py-2"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((r) => (
                    <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span>{r.name}</span>
                          <span className="text-xs text-muted-foreground">{r.marketplace_name}{r.category ? ` · ${r.category}` : ''}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground tabular">
                        {r.min_price ? formatBRL(r.min_price) : '—'} a {r.max_price ? formatBRL(r.max_price) : '∞'}
                      </td>
                      <td className="px-5 py-3 text-right tabular">
                        {formatPct(r.percentage_fee)}{Number(r.additional_fee_pct) ? ` + ${formatPct(r.additional_fee_pct)}` : ''}
                      </td>
                      <td className="px-5 py-3 text-right tabular">
                        {formatBRL(Number(r.fixed_fee) + Number(r.additional_fixed_fee))}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground tabular">
                        {formatDate(r.effective_from)}{r.effective_to ? ` — ${formatDate(r.effective_to)}` : ''}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <InlineAction action={toggleFeeRule} fields={{ id: r.id, active: r.active ? 'false' : 'true' }} label={r.active ? 'Desativar' : 'Ativar'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhuma regra de taxa." description="Sem regra, o motor não calcula margem — ele avisa em vez de inventar." />
          )}
          <details className="border-t border-border px-5 py-4" open={rules.length === 0}>
            <summary className="cursor-pointer text-sm text-primary">Adicionar regra</summary>
            <div className="pt-4">
              <FeeRuleForm marketplaces={marketplaces} today={todayISO()} />
            </div>
          </details>
        </div>
      </Panel>

      <Panel title="Integrações">
        {banners.map((b) => (
          <div key={b.name} role="status" className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm">
            <Badge tone={b.tone}>{b.name}</Badge>
            <span>{b.text}</span>
          </div>
        ))}
        <div className="grid gap-px bg-border lg:grid-cols-3">
          {ADAPTERS.map((a) => {
            const conn = connections.find((c) => c.code === a.code)
            const missingEnv = a.requiredEnv.filter((k) => !process.env[k])
            return (
              <div key={a.code} className="flex flex-col gap-4 bg-surface px-5 py-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{a.name}</span>
                  <Badge tone={conn?.status === 'connected' ? 'positive' : 'neutral'}>
                    {conn?.status === 'connected' ? 'Conectado' : 'Não conectado'}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {a.role === 'operational_hub' ? 'Hub operacional — não é fonte da verdade.' : 'Marketplace'}
                  {conn?.last_sync ? ` · Última sync ${formatDateTime(conn.last_sync)} (${conn.last_sync_status})` : ''}
                </p>
                {missingEnv.length ? (
                  <p className="font-mono text-[11px] leading-relaxed text-attention">Faltam: {missingEnv.join(', ')}</p>
                ) : null}
                {CONNECT_ROUTES[a.code] && !missingEnv.length ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {conn?.status === 'connected' ? (
                      <>
                        <InlineAction action={syncNow} fields={{ code: a.code, days: '30' }} label="Sincronizar 30 dias" />
                        <InlineAction action={disconnectIntegration} fields={{ code: a.code }} label="Desconectar" />
                      </>
                    ) : (
                      <a
                        href={CONNECT_ROUTES[a.code].href}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        {conn?.status === 'expired' ? 'Reconectar' : CONNECT_ROUTES[a.code].label}
                      </a>
                    )}
                  </div>
                ) : null}
                <ul className="flex flex-col gap-1.5">
                  {(Object.keys(a.capabilities) as Capability[]).map((cap) => {
                    const info = a.capabilities[cap]
                    return (
                      <li key={cap} className="flex items-center justify-between gap-2 text-xs" title={info.note}>
                        <span>{CAPABILITY_LABELS[cap]}</span>
                        <Badge tone={CAP_TONE[info.status]}>{info.status}</Badge>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="Auditoria · últimos 50 eventos">
        {logs.length ? (
          <ul className="divide-y divide-border">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-xs">
                <span className="font-mono text-muted-foreground tabular">{formatDateTime(l.created_at)}</span>
                <span className="font-mono">{l.action}</span>
                <span className="text-muted-foreground">{l.entity_type}{l.entity_id ? ` #${l.entity_id}` : ''}</span>
                <span className="text-muted-foreground">{l.user_email ?? 'sistema'}</span>
                {l.reason ? <span className="text-muted-foreground">· {l.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sem eventos." />
        )}
      </Panel>
    </>
  )
}

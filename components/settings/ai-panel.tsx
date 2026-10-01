import { Badge } from '@/components/ui/badges'
import { Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { testAIConnection } from '@/lib/actions/ai'
import { getAIOverview } from '@/lib/ai/telemetry'
import { listConfiguredModels } from '@/lib/ai/model-router'
import { getProvider, hasOpenAIKey, PROVIDER_LABEL } from '@/lib/ai/openai-client'
import { formatDateTime } from '@/lib/format'

const TIER_LABEL = { default: 'Modelo padrão', fast: 'Modelo rápido', deep: 'Modelo profundo' } as const

const MODEL_NAME: Record<string, string> = {
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
}

const STATUS_LABEL: Record<string, string> = { success: 'Sucesso', error: 'Erro', invalid: 'Resposta inválida' }

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 bg-surface px-5 py-4 ${wide ? 'md:col-span-2' : ''}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export async function AIPanel() {
  const overview = await getAIOverview().catch(() => null)
  const provider = getProvider()
  const keyOk = hasOpenAIKey()
  const models = listConfiguredModels()
  const last = overview?.lastCall ?? null

  return (
    <Panel title="Inteligência artificial" action={<InlineAction action={testAIConnection} fields={{}} label="Testar conexão" variant="secondary" />}>
      <dl className="grid gap-px bg-border text-sm md:grid-cols-2">
        <Field label="Provedor atual">
          {provider ? PROVIDER_LABEL[provider] : <span className="text-critical">Nenhum — IA não configurada em produção</span>}
        </Field>
        <Field label="API Key (OPENAI_API_KEY)">
          {keyOk ? <Badge tone="positive">Configurada</Badge> : <Badge tone="attention">Não configurada</Badge>}
        </Field>
        {models.map((m) => (
          <Field key={m.tier} label={`${TIER_LABEL[m.tier]} · ${m.envKey}`}>
            {MODEL_NAME[m.modelId] ?? m.modelId} <span className="font-mono text-xs text-muted-foreground">{m.modelId}</span>
            {m.fromEnv ? null : <span className="text-xs text-muted-foreground"> (padrão do sistema)</span>}
          </Field>
        ))}
        <Field label="Última chamada">
          {last ? `${formatDateTime(last.created_at)} · ${last.task}` : 'Nenhuma'}
        </Field>
        <Field label="Último modelo utilizado">
          {last ? (
            <>
              {MODEL_NAME[last.model] ?? last.model}{' '}
              <span className="text-xs text-muted-foreground">via {last.provider === 'openai' ? 'OpenAI' : 'Vercel AI Gateway'}</span>
            </>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Status da última chamada">
          {last ? (
            <Badge tone={last.status === 'success' ? 'positive' : 'critical'}>{STATUS_LABEL[last.status] ?? last.status}</Badge>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Custo da última chamada">
          <span className="tabular">{last ? (last.cost_usd !== null ? `US$ ${Number(last.cost_usd).toFixed(4)}` : 'não calculado') : '—'}</span>
        </Field>
        <Field label="Últimos 7 dias" wide>
          <span className="tabular">
            {overview?.last7d
              ? `${overview.last7d.calls} chamadas · ${overview.last7d.errors} erros · ${overview.last7d.input_tokens + overview.last7d.output_tokens} tokens · ${
                  overview.last7d.cost_usd !== null ? `US$ ${overview.last7d.cost_usd.toFixed(4)}` : 'custo não calculado'
                }`
              : overview && !overview.tableReady
                ? 'Tabela ai_calls ainda não criada (rode db/004_ai_layer.sql)'
                : 'Sem chamadas'}
          </span>
        </Field>
        {last?.error ? (
          <Field label="Último erro" wide>
            <span className="font-mono text-xs text-critical">{last.error}</span>
          </Field>
        ) : null}
      </dl>
    </Panel>
  )
}

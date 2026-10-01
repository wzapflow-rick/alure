import { Badge } from '@/components/ui/badges'
import { Panel } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { testAIConnection } from '@/lib/actions/ai'
import { getAIOverview } from '@/lib/ai/telemetry'
import { listConfiguredModels } from '@/lib/ai/model-router'
import { getProvider, hasOpenAIKey } from '@/lib/ai/openai-client'
import { formatDateTime } from '@/lib/format'

const TIER_LABEL = { default: 'Padrão', fast: 'Rápido', deep: 'Profundo' } as const

export async function AIPanel() {
  const overview = await getAIOverview().catch(() => null)
  const provider = getProvider()
  const keyOk = hasOpenAIKey()
  const models = listConfiguredModels()

  return (
    <Panel title="Inteligência artificial" action={<InlineAction action={testAIConnection} fields={{}} label="Testar conexão" variant="secondary" />}>
      <dl className="grid gap-px bg-border text-sm md:grid-cols-2">
        <div className="flex flex-col gap-1 bg-surface px-5 py-4">
          <dt className="text-xs text-muted-foreground">OPENAI_API_KEY</dt>
          <dd>
            {keyOk ? <Badge tone="positive">Configurada</Badge> : <Badge tone="attention">Não configurada</Badge>}
          </dd>
        </div>
        <div className="flex flex-col gap-1 bg-surface px-5 py-4">
          <dt className="text-xs text-muted-foreground">Provedor em uso</dt>
          <dd>
            {provider === 'openai'
              ? 'OpenAI (chave própria)'
              : provider === 'gateway'
                ? 'Vercel AI Gateway (sem chave OpenAI)'
                : 'IA não configurada'}
          </dd>
        </div>
        {models.map((m) => (
          <div key={m.tier} className="flex flex-col gap-1 bg-surface px-5 py-4">
            <dt className="text-xs text-muted-foreground">
              {`Modelo ${TIER_LABEL[m.tier]} · ${m.envKey}`}
            </dt>
            <dd className="font-mono text-xs">
              {m.modelId} {m.fromEnv ? null : <span className="text-muted-foreground">(padrão do sistema)</span>}
            </dd>
          </div>
        ))}
        <div className="flex flex-col gap-1 bg-surface px-5 py-4">
          <dt className="text-xs text-muted-foreground">Última análise da IA</dt>
          <dd>
            {overview?.lastAnalysis
              ? `${formatDateTime(overview.lastAnalysis.created_at)} · ${overview.lastAnalysis.status}`
              : 'Nenhuma'}
          </dd>
        </div>
        <div className="flex flex-col gap-1 bg-surface px-5 py-4">
          <dt className="text-xs text-muted-foreground">Últimos 7 dias</dt>
          <dd className="tabular">
            {overview?.last7d
              ? `${overview.last7d.calls} chamadas · ${overview.last7d.errors} erros · ${overview.last7d.input_tokens + overview.last7d.output_tokens} tokens${
                  overview.last7d.cost_usd !== null ? ` · US$ ${overview.last7d.cost_usd.toFixed(4)}` : ''
                }`
              : overview && !overview.tableReady
                ? 'Tabela ai_calls ainda não criada (rode db/004_ai_layer.sql)'
                : 'Sem chamadas'}
          </dd>
        </div>
        {overview?.lastCall?.error ? (
          <div className="flex flex-col gap-1 bg-surface px-5 py-4 md:col-span-2">
            <dt className="text-xs text-muted-foreground">Último erro</dt>
            <dd className="font-mono text-xs text-critical">{overview.lastCall.error}</dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  )
}

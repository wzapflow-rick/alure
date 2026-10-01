import { Badge, type Tone } from '@/components/ui/badges'
import { formatDateTime } from '@/lib/format'
import type { AIBriefBlock } from '@/lib/ai/schemas'

const CONFIDENCE: Record<'LOW' | 'MEDIUM' | 'HIGH', { tone: Tone; label: string }> = {
  HIGH: { tone: 'positive', label: 'Confiança alta' },
  MEDIUM: { tone: 'attention', label: 'Confiança média' },
  LOW: { tone: 'critical', label: 'Confiança baixa' },
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-pretty">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AIReadingPanel({ block }: { block: AIBriefBlock | undefined }) {
  if (!block) return null

  if (block.status !== 'ok' || !block.analysis) {
    const text =
      block.status === 'not_configured'
        ? 'IA não configurada. Configure OPENAI_API_KEY nas variáveis de ambiente da Vercel.'
        : block.status === 'invalid'
          ? 'A resposta da IA não passou na validação e foi descartada. As prioridades acima continuam valendo.'
          : 'A IA não respondeu nesta análise. As prioridades acima continuam valendo.'
    return (
      <section aria-label="Leitura da IA" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-5 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Leitura da IA</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </section>
    )
  }

  const a = block.analysis
  const confidence = CONFIDENCE[a.confidence]
  const unverified = block.validation?.unverifiedNumbers ?? []

  return (
    <section aria-label="Leitura da IA" className="flex flex-col gap-5 rounded-lg border border-border bg-surface px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Leitura da IA</h2>
          <Badge tone={confidence.tone}>{confidence.label}</Badge>
          {a.insufficient_data ? <Badge tone="attention">Dados insuficientes</Badge> : null}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {block.model} · {formatDateTime(block.generatedAt)} · {a.review_period}
        </span>
      </div>

      <p className="text-base leading-relaxed text-pretty">{a.summary}</p>

      {a.main_bottleneck ? (
        <div className="flex flex-col gap-1 border-l-2 border-primary pl-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Maior gargalo</span>
          <p className="text-sm leading-relaxed">{a.main_bottleneck}</p>
        </div>
      ) : null}

      {a.priorities.length ? (
        <ol className="flex flex-col gap-3">
          {a.priorities.map((p, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">Prioridade {i + 1}</span>
                <span className="text-sm font-medium">{p.title}</span>
                {p.sku ? <span className="font-mono text-[11px] text-muted-foreground">{p.sku}</span> : null}
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-sm leading-relaxed md:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">Fato</dt>
                <dd>{p.fact}</dd>
                <dt className="text-muted-foreground">Interpretação</dt>
                <dd>{p.interpretation}</dd>
                {p.hypothesis ? (
                  <>
                    <dt className="text-muted-foreground">Hipótese</dt>
                    <dd className="italic">{p.hypothesis}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Ação</dt>
                <dd className="font-medium">{p.action}</dd>
                <dt className="text-muted-foreground">Métrica</dt>
                <dd>{p.metric}</dd>
                <dt className="text-muted-foreground">Revisar em</dt>
                <dd className="font-mono text-xs">{p.review_date}</dd>
              </dl>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <List title="O que mudou" items={a.what_changed} />
        <List title="O que importa" items={a.what_matters} />
        <List title="Oportunidades" items={a.opportunities} />
        <List title="Testes" items={a.tests} />
        <List title="O que não mexer" items={a.do_not_touch} />
        <List title="Dados pendentes" items={a.pending_data} />
      </div>

      {unverified.length ? (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          {`Números não encontrados no contexto foram removidos da análise: ${unverified.slice(0, 6).join(', ')}`}
        </p>
      ) : null}
    </section>
  )
}

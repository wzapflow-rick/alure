import { Badge, type Tone } from '@/components/ui/badges'
import { formatDateTime } from '@/lib/format'
import type { AIBriefBlock, ChangeGroup, MetricLine, OpportunityCard, PendingCard, SignalCard } from '@/lib/ai/schemas'

const CONFIDENCE: Record<'LOW' | 'MEDIUM' | 'HIGH', { tone: Tone; label: string }> = {
  HIGH: { tone: 'positive', label: 'Confiança alta' },
  MEDIUM: { tone: 'attention', label: 'Confiança média' },
  LOW: { tone: 'critical', label: 'Confiança baixa' },
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{children}</h3>
}

function List({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items?.length) return null
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
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

const deltaTone = (delta: string | null) =>
  !delta ? 'text-muted-foreground' : delta.startsWith('+') ? 'text-positive' : delta.startsWith('−') ? 'text-critical' : 'text-foreground'

function Changes({ groups }: { groups: ChangeGroup[] }) {
  if (!groups.length) return null
  return (
    <div className="flex flex-col gap-3 md:col-span-2">
      <SectionTitle>O que mudou</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.source} className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{g.source}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {`Anterior ${g.period_previous} · Atual ${g.period_current}`}
              </span>
            </div>
            <table className="w-full text-sm">
              <caption className="sr-only">{`Métricas de ${g.source}: período anterior e atual`}</caption>
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-1 font-normal">Métrica</th>
                  <th scope="col" className="py-1 text-right font-normal">Anterior</th>
                  <th scope="col" className="py-1 text-right font-normal">Atual</th>
                  <th scope="col" className="py-1 text-right font-normal">Variação</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.name} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-normal">{r.name}</th>
                    {r.note ? (
                      <td colSpan={3} className="py-1.5 text-right text-xs text-muted-foreground">
                        {`Dados insuficientes: ${r.note}`}
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 text-right tabular text-muted-foreground">{r.from}</td>
                        <td className="py-1.5 text-right tabular">{r.to}</td>
                        <td className={`py-1.5 text-right tabular ${deltaTone(r.delta)}`}>{r.delta ?? '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

function Line({ line }: { line: MetricLine }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
      <span className="text-muted-foreground">{line.name}</span>
      <span className="tabular">
        {`${line.previous} → ${line.current}`}
        {line.delta ? <span className={`ml-2 ${deltaTone(line.delta)}`}>{line.delta}</span> : null}
      </span>
    </div>
  )
}

function Signals({ cards }: { cards: SignalCard[] }) {
  if (!cards.length) return null
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Possível sinal a investigar</SectionTitle>
      {cards.map((c) => (
        <div key={`${c.sku}-${c.canal}`} className="flex flex-col gap-1.5 rounded-md border border-dashed border-border px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{c.produto}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{`${c.sku} · ${c.canal}`}</span>
          </div>
          {c.lines.map((l) => (
            <Line key={l.name} line={l} />
          ))}
          {c.observacao ? <p className="text-sm leading-relaxed text-pretty">{c.observacao}</p> : null}
          <p className="text-xs leading-relaxed text-muted-foreground">{c.motivo}</p>
        </div>
      ))}
    </div>
  )
}

function Opportunities({ cards }: { cards: OpportunityCard[] }) {
  if (!cards.length) return null
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Oportunidades de monitoramento</SectionTitle>
      {cards.map((c, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{c.produto ?? c.canal}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{c.sku ? `${c.sku} · ${c.canal}` : 'Canal'}</span>
          </div>
          <Line line={c.line} />
          <span className="font-mono text-[11px] text-muted-foreground">{c.period}</span>
          <p className="text-sm leading-relaxed text-pretty">{c.interpretacao}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{c.motivo}</p>
        </div>
      ))}
    </div>
  )
}

function Pending({ items }: { items: PendingCard[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>Dados pendentes</SectionTitle>
      <ul className="flex flex-col gap-2">
        {items.map((p, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-sm leading-relaxed">
            <span>{p.dado}</span>
            <span className="text-xs text-muted-foreground">{p.impacto}</span>
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
        {a.changes ? <Changes groups={a.changes} /> : <List title="O que mudou" items={a.what_changed} />}
        <List title="O que importa" items={a.what_matters} />
        <List title="Hipóteses" items={a.hypotheses} />
        {a.signal_cards ? <Signals cards={a.signal_cards} /> : null}
        {a.opportunity_cards ? <Opportunities cards={a.opportunity_cards} /> : <List title="Oportunidades" items={a.opportunities} />}
        <List title="Testes" items={a.tests} />
        <List title="O que não mexer" items={a.do_not_touch} />
        {a.pending_cards ? <Pending items={a.pending_cards} /> : <List title="Dados pendentes" items={a.pending_data} />}
      </div>
    </section>
  )
}

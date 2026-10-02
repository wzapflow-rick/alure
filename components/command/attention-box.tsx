import Link from 'next/link'
import { Dot, severityTone } from '@/components/ui/badges'

export type AttentionLine = { id: string; severity: string; sku: string | null; message: string; href: string }

const MAX_LINES = 3

export function AttentionBox({ lines, total }: { lines: AttentionLine[]; total: number }) {
  return (
    <section aria-label="Atenção" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="eyebrow tabular">
          Atenção · <span className={total ? 'text-attention' : undefined}>{total}</span>
        </h2>
        {total ? (
          <Link href="/alertas" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Ver todos
          </Link>
        ) : null}
      </header>

      {lines.length ? (
        <ul className="flex flex-col gap-3">
          {lines.slice(0, MAX_LINES).map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex items-baseline gap-2.5 text-sm leading-relaxed transition-colors hover:text-primary">
                <Dot tone={severityTone(a.severity)} />
                <span className="text-pretty">
                  {a.sku ? <span className="font-mono text-foreground">{a.sku} · </span> : null}
                  <span className="text-muted-foreground">{a.message}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nada fora das prioridades exige atenção.</p>
      )}
    </section>
  )
}

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Dot, severityTone } from '@/components/ui/badges'
import { PanelCard } from '@/components/command/panel-card'

export type AttentionLine = { id: string; severity: string; sku: string | null; message: string; href: string }

const MAX_LINES = 3

export function AttentionBox({ lines, total }: { lines: AttentionLine[]; total: number }) {
  return (
    <PanelCard
      label="Atenção"
      icon={<AlertTriangle className="size-4" />}
      count={total}
      tone={total ? 'attention' : 'neutral'}
      href={total ? '/alertas' : undefined}
      linkLabel="Ver todos"
    >
      {lines.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {lines.slice(0, MAX_LINES).map((a) => (
            <li key={a.id}>
              <Link
                href={a.href}
                className="flex items-baseline gap-2.5 py-3 text-sm leading-relaxed transition-colors first:pt-0 hover:text-primary"
              >
                <Dot tone={severityTone(a.severity)} />
                <span className="min-w-0 text-pretty">
                  {a.sku ? <span className="font-mono text-[13px] text-foreground">{a.sku} </span> : null}
                  <span className="text-muted-foreground">{a.message}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">Nada fora das prioridades exige atenção.</p>
      )}
    </PanelCard>
  )
}

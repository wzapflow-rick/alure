'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { importCosts, type CostImportResult } from '@/lib/actions/cost-import'
import { cn } from '@/lib/utils'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function ModeButton({ mode, children, variant }: { mode: 'preview' | 'apply'; children: React.ReactNode; variant: 'primary' | 'secondary' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" name="mode" value={mode} variant={variant} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  )
}

export function CostImportForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<CostImportResult, FormData>(importCosts, null)
  const canApply = !!state?.matches?.length && !state.applied

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4 p-5">
        <Field
          label="Linhas da planilha"
          htmlFor="data"
          hint="Copie as colunas do Excel/Sheets e cole aqui. Ordem: SKU, custo unitário, quantidade (opcional), fornecedor (opcional). Cabeçalho é ignorado. SKUs com e sem KLS- recebem o mesmo custo."
        >
          <Textarea
            id="data"
            name="data"
            required
            rows={12}
            className="font-mono text-xs"
            placeholder={'SKU\tCusto\n2060.C83\t189,90\n4900.C91.PQ\t52,40\t10\tDeca'}
          />
        </Field>
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <Field label="Data do custo" htmlFor="effectiveDate" className="md:w-48">
            <Input id="effectiveDate" name="effectiveDate" type="date" required defaultValue={today} />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
            <input type="checkbox" name="replace" defaultChecked className="size-4 accent-primary" />
            Substituir custos já cadastrados (desativa lotes anteriores)
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ModeButton mode="preview" variant={canApply ? 'secondary' : 'primary'}>Pré-visualizar</ModeButton>
          {canApply ? <ModeButton mode="apply" variant="primary">Aplicar custos</ModeButton> : null}
        </div>
        {state?.message ? (
          <p role="status" className={cn('text-sm', state.ok ? 'text-positive' : 'text-critical')}>
            {state.message}
          </p>
        ) : null}
      </form>

      {state?.matches?.length ? (
        <div className="border-t border-border">
          <h3 className="px-5 pt-4 text-sm font-medium">Encontrados ({state.matches.length})</h3>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-left font-normal">SKU</th>
                  <th className="px-5 py-2 text-left font-normal">Produtos no catálogo</th>
                  <th className="px-5 py-2 text-right font-normal">Custo</th>
                  <th className="px-5 py-2 text-right font-normal">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {state.matches.map((m) => (
                  <tr key={m.line} className="border-t border-border/60">
                    <td className="px-5 py-2 font-mono text-xs">{m.sku}</td>
                    <td className="px-5 py-2">
                      {m.products.map((p) => (
                        <div key={p.id} className="truncate text-xs text-muted-foreground">
                          <span className="font-mono text-foreground">{p.sku}</span> · {p.name}
                        </div>
                      ))}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">{brl.format(m.unitCost)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{m.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {state?.unmatched?.length ? (
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-sm font-medium text-attention">Não encontrados no catálogo ({state.unmatched.length})</h3>
          <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
            {state.unmatched.map((u) => u.sku).join(', ')}
          </p>
        </div>
      ) : null}

      {state?.invalid?.length ? (
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-sm font-medium text-critical">Linhas ignoradas ({state.invalid.length})</h3>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {state.invalid.slice(0, 50).map((i) => (
              <li key={i.line}>
                Linha {i.line}: {i.reason} — <span className="font-mono">{i.raw}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

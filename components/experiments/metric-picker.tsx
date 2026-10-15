'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Field, Select } from '@/components/ui/primitives'
import {
  DEFAULT_PRIMARY_METRIC,
  DEFAULT_SECONDARY_METRICS,
  EXPERIMENT_METRICS,
  type ExperimentMetric,
} from '@/lib/experiment-metrics'

export function MetricPicker() {
  const [primary, setPrimary] = useState<ExperimentMetric>(DEFAULT_PRIMARY_METRIC)
  const [secondary, setSecondary] = useState<ExperimentMetric[]>(DEFAULT_SECONDARY_METRICS)

  const visibleSecondary = secondary.filter((m) => m !== primary)

  function toggle(metric: ExperimentMetric) {
    setSecondary((current) =>
      current.includes(metric) ? current.filter((m) => m !== metric) : [...current, metric],
    )
  }

  return (
    <div className="grid gap-4">
      <Field label="Métrica principal" htmlFor="primaryMetric" hint="O que decide se o teste deu certo.">
        <Select
          id="primaryMetric"
          name="primaryMetric"
          required
          value={primary}
          onChange={(e) => setPrimary(e.target.value as ExperimentMetric)}
        >
          {EXPERIMENT_METRICS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          Métricas secundárias
          <span className="ml-1 font-normal">
            {visibleSecondary.length ? `· ${visibleSecondary.length} selecionada${visibleSecondary.length > 1 ? 's' : ''}` : '· opcional'}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {EXPERIMENT_METRICS.filter((m) => m !== primary).map((m) => {
            const active = secondary.includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(m)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11 ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-foreground hover:bg-accent'
                }`}
              >
                {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                {m}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">Toque para marcar ou desmarcar. Elas ajudam a ver efeitos colaterais.</p>
        <input type="hidden" name="secondaryMetrics" value={visibleSecondary.join(',')} />
      </fieldset>
    </div>
  )
}

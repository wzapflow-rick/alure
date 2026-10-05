import { z } from 'zod'

function int(label: string, min: number, max: number) {
  return z.coerce
    .number({ message: `${label}: número inválido` })
    .int(`${label}: use número inteiro`)
    .min(min, `${label}: mínimo ${min}`)
    .max(max, `${label}: máximo ${max}`)
}

/**
 * Hard limits: these bounds are not user-configurable. Even if someone edits the form,
 * the server refuses values that put the number at risk.
 */
export const settingsSchema = z
  .object({
    min_delay_s: int('Intervalo mínimo', 30, 900),
    max_delay_s: int('Intervalo máximo', 45, 1800),
    batch_min: int('Lote mínimo', 3, 50),
    batch_max: int('Lote máximo', 3, 60),
    batch_pause_min_s: int('Pausa mínima entre lotes', 300, 7200),
    batch_pause_max_s: int('Pausa máxima entre lotes', 300, 10800),
    long_break_chance: int('Chance de pausa longa', 0, 20),
    hourly_cap: int('Limite por hora', 1, 60),
    daily_cap: int('Limite por dia', 1, 400),
    window_start_hour: int('Início da janela', 8, 20),
    window_end_hour: int('Fim da janela', 9, 21),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Escolha ao menos um dia da semana.'),
    warmup_enabled: z.boolean(),
    warmup_start: int('Aquecimento inicial', 5, 100),
    warmup_step: int('Aumento diário', 0, 50),
    contact_cooldown_days: int('Intervalo por contato', 1, 365),
    max_consecutive_failures: int('Falhas seguidas', 1, 10),
    max_error_rate: int('Taxa de erro', 5, 50),
    max_invalid_rate: int('Números inválidos', 10, 60),
    typing_enabled: z.boolean(),
    opt_out_keywords: z.array(z.string().trim().toLowerCase().min(2).max(30)).min(1, 'Informe ao menos uma palavra de descadastro.'),
  })
  .superRefine((v, ctx) => {
    if (v.max_delay_s < v.min_delay_s + 15)
      ctx.addIssue({ code: 'custom', message: 'O intervalo máximo precisa ser pelo menos 15s maior que o mínimo (variação humana).' })
    if (v.batch_max < v.batch_min) ctx.addIssue({ code: 'custom', message: 'Lote máximo menor que o mínimo.' })
    if (v.batch_pause_max_s < v.batch_pause_min_s) ctx.addIssue({ code: 'custom', message: 'Pausa máxima menor que a mínima.' })
    if (v.window_end_hour <= v.window_start_hour) ctx.addIssue({ code: 'custom', message: 'A janela precisa terminar depois de começar.' })
    if (v.hourly_cap > v.daily_cap) ctx.addIssue({ code: 'custom', message: 'Limite por hora maior que o limite por dia.' })
    const fastest = 3600 / v.min_delay_s
    if (fastest < 1) ctx.addIssue({ code: 'custom', message: 'Intervalo mínimo inválido.' })
  })

export type ProtectionSettings = z.infer<typeof settingsSchema>

export type BroadcastSettings = ProtectionSettings & {
  paused_all: boolean
  warmup_started_on: string | null
  warmup_days: number | null
  last_tick_at: string | null
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Daily ceiling after warm-up: starts low and grows by `warmup_step` per day until `daily_cap`. */
export function effectiveDailyCap(s: Pick<BroadcastSettings, 'daily_cap' | 'warmup_enabled' | 'warmup_start' | 'warmup_step' | 'warmup_days'>) {
  if (!s.warmup_enabled) return s.daily_cap
  const days = Math.max(0, s.warmup_days ?? 0)
  return Math.min(s.daily_cap, s.warmup_start + s.warmup_step * days)
}

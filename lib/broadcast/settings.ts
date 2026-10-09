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
    quarantine_hours: int('Quarentena após incidente', 24, 336),
    incident_cut_pct: int('Corte do limite após incidente', 25, 90),
    min_reply_rate: int('Taxa mínima de resposta', 0, 50),
    typing_enabled: z.boolean(),
    cold_share_pct: int('Cota de contatos frios', 10, 100),
    cold_delay_pct: int('Intervalo extra para frios', 0, 200),
    cold_require_two_step: z.boolean(),
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
  id: string
  /** Numbers paired less than 7 days ago start the ramp low, whatever the configuration says. */
  new_number?: boolean
  paused_all: boolean
  warmup_started_on: string | null
  warmup_days: number | null
  last_tick_at: string | null
  ramp_cap: number | null
  ramp_evaluated_on: string | null
  quarantine_until: string | null
  last_state: string | null
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type CapInput = Pick<BroadcastSettings, 'daily_cap' | 'warmup_enabled' | 'warmup_start' | 'ramp_cap'> & { new_number?: boolean }

export const NEW_NUMBER_DAILY_CAP = 20

/** Limit earned by the number: grows only after healthy days and is cut on incidents. */
export function baseDailyCap(s: CapInput) {
  const cap = s.warmup_enabled ? Math.min(s.daily_cap, s.ramp_cap ?? s.warmup_start) : s.daily_cap
  return s.new_number ? Math.min(cap, NEW_NUMBER_DAILY_CAP) : cap
}

export function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

/** Same total every day is a machine pattern; each day uses 85–100% of the limit, fixed for that date. */
function dailyJitter(day: string) {
  let h = 0
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 0.85 + ((h % 1000) / 1000) * 0.15
}

export function effectiveDailyCap(s: CapInput, day = todayKey()) {
  return Math.max(1, Math.floor(baseDailyCap(s) * dailyJitter(day)))
}

/** Spreads the day across the window instead of burning the whole limit in two hours. */
export function hourlyCeiling(s: Pick<BroadcastSettings, 'hourly_cap' | 'window_start_hour' | 'window_end_hour'>, dailyCap: number) {
  const hours = Math.max(1, s.window_end_hour - s.window_start_hour)
  return Math.min(s.hourly_cap, Math.max(3, Math.ceil((dailyCap / hours) * 1.6)))
}

export function quarantineActive(s: Pick<BroadcastSettings, 'quarantine_until'>, now = Date.now()) {
  return Boolean(s.quarantine_until && new Date(s.quarantine_until).getTime() > now)
}

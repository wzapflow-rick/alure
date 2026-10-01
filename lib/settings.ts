import 'server-only'
import { z } from 'zod'
import { queryOne } from '@/lib/db'

export const engineSettingsSchema = z.object({
  dailyTarget: z.coerce.number().min(0),
  minMarginPct: z.coerce.number().min(-100).max(100),
  targetMarginPct: z.coerce.number().min(0).max(90),
  daysWithoutSale: z.coerce.number().int().min(1).max(60),
  windowDays: z.coerce.number().int().min(3).max(60),
  minVisitsForConversion: z.coerce.number().int().min(1),
  highTrafficVisits: z.coerce.number().int().min(1),
  lowConversionPct: z.coerce.number().min(0).max(100),
  healthyConversionPct: z.coerce.number().min(0).max(100),
  significantChangePct: z.coerce.number().min(1).max(500),
  minOrdersHistory: z.coerce.number().int().min(1),
  minHistoryDays: z.coerce.number().int().min(1),
})

export type EngineSettings = z.infer<typeof engineSettingsSchema>

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  dailyTarget: 20000,
  minMarginPct: 10,
  targetMarginPct: 20,
  daysWithoutSale: 3,
  windowDays: 7,
  minVisitsForConversion: 100,
  highTrafficVisits: 300,
  lowConversionPct: 1,
  healthyConversionPct: 2,
  significantChangePct: 30,
  minOrdersHistory: 5,
  minHistoryDays: 14,
}

export const ENGINE_SETTINGS_KEY = 'engine'

export async function getEngineSettings(): Promise<EngineSettings> {
  const row = await queryOne<{ value: Partial<EngineSettings> }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [ENGINE_SETTINGS_KEY],
  )
  const parsed = engineSettingsSchema.safeParse({ ...DEFAULT_ENGINE_SETTINGS, ...(row?.value ?? {}) })
  return parsed.success ? parsed.data : DEFAULT_ENGINE_SETTINGS
}

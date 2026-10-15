export const EXPERIMENT_METRICS = [
  'Conversão',
  'Pedidos',
  'Unidades vendidas',
  'Faturamento',
  'Margem',
  'Lucro',
  'Ticket médio',
  'Visitas',
  'CTR',
  'ROAS',
  'ACOS',
  'Posição no ranking',
] as const

export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number]

export const DEFAULT_PRIMARY_METRIC: ExperimentMetric = 'Conversão'
export const DEFAULT_SECONDARY_METRICS: ExperimentMetric[] = ['Pedidos', 'Margem', 'Visitas']

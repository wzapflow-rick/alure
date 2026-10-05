import type { Tone } from '@/components/ui/badges'
import type { ProspectFilter, WaStatus } from '@/lib/prospect/queries'

export const WA_STATUS: Record<WaStatus, { label: string; tone: Tone }> = {
  yes: { label: 'Tem WhatsApp', tone: 'positive' },
  no: { label: 'Sem WhatsApp', tone: 'critical' },
  pending: { label: 'A verificar', tone: 'neutral' },
  no_phone: { label: 'Sem telefone', tone: 'attention' },
  error: { label: 'Sem resposta', tone: 'attention' },
}

export const FILTER_LABEL: Record<ProspectFilter, string> = {
  all: 'Todos',
  yes: 'Com WhatsApp',
  pending: 'A verificar',
  no: 'Sem WhatsApp',
  no_phone: 'Sem telefone',
  error: 'Sem resposta',
}

export function siteHost(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

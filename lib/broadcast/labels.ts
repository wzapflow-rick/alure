import type { Tone } from '@/components/ui/badges'

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  running: { label: 'Enviando', tone: 'positive' },
  paused: { label: 'Pausada', tone: 'attention' },
  completed: { label: 'Concluída', tone: 'info' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const PAUSE_REASON: Record<string, string> = {
  manual: 'Pausada por você',
  whatsapp_desconectado: 'WhatsApp desconectado',
  falhas_seguidas: 'Falhas seguidas',
  taxa_de_erro: 'Taxa de erro alta',
  lista_ruim: 'Muitos números sem WhatsApp',
  risco_bloqueio: 'Sinal de bloqueio: parada de emergência',
  incidente: 'Incidente no número: quarentena',
  baixa_resposta: 'Poucas respostas: lista fria',
}

export const SKIP_REASON: Record<string, string> = {
  descadastrado: 'Pediu para sair',
  contato_recente: 'Contatado recentemente',
  sem_whatsapp: 'Sem WhatsApp',
  cancelada: 'Campanha cancelada',
  frio_sem_duas_etapas: 'Contato frio em campanha sem duas etapas',
  outro: 'Outro',
}

export const FOLLOWUP_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Oferta agendada', tone: 'info' },
  sending: { label: 'Enviando oferta', tone: 'info' },
  sent: { label: 'Oferta enviada', tone: 'positive' },
  failed: { label: 'Oferta falhou', tone: 'critical' },
  skipped: { label: 'Sem oferta (recusou)', tone: 'neutral' },
}

export const EVENT_LABEL: Record<string, string> = {
  criada: 'Campanha criada',
  iniciada: 'Envio iniciado',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
  pausa_lote: 'Pausa entre lotes',
  pausa_automatica: 'Pausa automática',
  parada_emergencia: 'Parada de emergência',
  pausa_geral: 'Pausa geral',
  retomada_geral: 'Disparos liberados',
  protecoes_alteradas: 'Proteções alteradas',
  descadastro: 'Descadastro',
  aquecimento: 'Aquecimento avaliado',
  incidente: 'Incidente no número',
  resposta_hostil: 'Resposta hostil: contato bloqueado',
  cota_fria: 'Cota de contatos frios atingida',
}

export const MESSAGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  sent: { label: 'Enviada', tone: 'positive' },
  failed: { label: 'Falhou', tone: 'critical' },
  skipped: { label: 'Pulada', tone: 'neutral' },
  sending: { label: 'Enviando', tone: 'info' },
  pending: { label: 'Na fila', tone: 'neutral' },
}

export function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function relativeMinutes(value: string | null) {
  if (!value) return null
  return Math.round((Date.now() - new Date(value).getTime()) / 60000)
}

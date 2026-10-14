'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Sparkles,
  X,
} from 'lucide-react'
import { Markdown } from '@/components/assistant/markdown'
import { ATTACHMENT_LIMITS, type DocumentData } from '@/lib/assistant/attachments'
import { ATTACHMENT_ACCEPT, readAttachment, type Attachment } from '@/lib/assistant/read-attachment'

const SUGGESTIONS = [
  'O que devo fazer primeiro hoje?',
  'Como estão minhas campanhas de Ads no ML nos últimos 30 dias?',
  'Quais anúncios gastam em Ads com ACOS alto?',
  'Algum produto vendendo com margem negativa?',
]

const TOOL_LABEL: Record<string, string> = {
  'tool-resumoDoDia': 'KPIs do dia',
  'tool-vendasPorPeriodo': 'Vendas no banco',
  'tool-maisVendidos': 'Ranking de produtos',
  'tool-pedidos': 'Pedidos',
  'tool-anuncios': 'Anúncios',
  'tool-buscarProduto': 'Busca de produto',
  'tool-desempenhoCanais': 'Comparação de canais',
  'tool-taxas': 'Regras de taxa',
  'tool-integracoes': 'Integrações',
  'tool-recomendacoes': 'Recomendações do motor',
  'tool-alertas': 'Alertas',
  'tool-testes': 'Testes',
  'tool-memoria': 'Memória estratégica',
  'tool-buscarConversas': 'Conversas anteriores',
  'tool-registrarMemoria': 'Registrado na memória',
  'tool-publicidadeCampanhas': 'Campanhas de Ads (ML ao vivo)',
  'tool-publicidadeCampanhaDetalhe': 'Detalhe da campanha (ML ao vivo)',
  'tool-publicidadeAnuncios': 'Anúncios no Ads (ML ao vivo)',
  'tool-publicidadeHistorico': 'Histórico de Ads e TACOS',
}

type ToolPart = { type: string; state?: string; output?: unknown }

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function AttachmentChip({
  name,
  kind,
  detail,
  onRemove,
}: {
  name: string
  kind: 'image' | 'planilha' | 'texto' | 'documento' | 'pdf'
  detail?: string
  onRemove?: () => void
}) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'planilha' ? FileSpreadsheet : FileText
  return (
    <span className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate text-foreground">{name}</span>
      {detail ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{detail}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={`Remover ${name}`}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

function attachmentKind(a: Attachment) {
  if (a.type === 'document') return a.data.kind
  return a.part.mediaType === 'application/pdf' ? 'pdf' : 'image'
}

function UserMessage({ message }: { message: UIMessage }) {
  const chips = message.parts.flatMap((p, i) => {
    if (p.type === 'file') {
      const kind = p.mediaType === 'application/pdf' ? 'pdf' : 'image'
      return [<AttachmentChip key={i} name={p.filename ?? 'arquivo'} kind={kind} />]
    }
    if (p.type === 'data-document') {
      const d = p.data as DocumentData
      return [<AttachmentChip key={i} name={d.name} kind={d.kind} />]
    }
    return []
  })
  const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n').trim()
  return (
    <div className="ml-auto flex max-w-[88%] flex-col items-end gap-2 sm:max-w-[75%]">
      {chips.length ? <div className="flex max-w-full flex-wrap justify-end gap-2">{chips}</div> : null}
      {text ? (
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground sm:text-sm">
          {text}
        </div>
      ) : null}
    </div>
  )
}

function toolFailed(p: ToolPart) {
  return (
    p.state === 'output-error' ||
    (typeof p.output === 'object' && p.output !== null && 'erro' in (p.output as Record<string, unknown>))
  )
}

function ToolSteps({ parts, running }: { parts: ToolPart[]; running: boolean }) {
  if (!parts.length) return null
  const pending = parts.filter((p) => p.state !== 'output-available' && p.state !== 'output-error')
  const active = running && pending.length > 0
  const saved = parts.some((p) => p.type === 'tool-registrarMemoria')
  const summary = active
    ? `Consultando ${TOOL_LABEL[pending[pending.length - 1].type] ?? 'dados'}…`
    : `${parts.length} ${parts.length === 1 ? 'consulta' : 'consultas'}${saved ? ' · memória atualizada' : ''}`

  return (
    <details className="group w-fit max-w-full rounded-lg border border-border bg-surface text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-muted-foreground [&::-webkit-details-marker]:hidden">
        {active ? (
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
        ) : (
          <Check className="size-3.5 text-primary" aria-hidden />
        )}
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
        {parts.map((p, i) => {
          const failed = toolFailed(p)
          const done = p.state === 'output-available' || p.state === 'output-error'
          return (
            <li key={i} className="flex items-center gap-2">
              {failed ? (
                <AlertCircle className="size-3.5 shrink-0 text-critical" aria-hidden />
              ) : done ? (
                <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              )}
              <span className={failed ? 'text-critical' : 'text-foreground/80'}>
                {TOOL_LABEL[p.type] ?? p.type.replace('tool-', '')}
                {failed ? ' · falhou' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function AssistantAvatar() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20"
      aria-hidden
    >
      <Sparkles className="size-4" />
    </span>
  )
}

function AssistantMessage({ message, running }: { message: UIMessage; running: boolean }) {
  const tools = message.parts.filter((p) => p.type.startsWith('tool-')) as ToolPart[]
  return (
    <div className="flex min-w-0 gap-3">
      <AssistantAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        <span className="sr-only">Assistente:</span>
        <ToolSteps parts={tools} running={running} />
        {message.parts.map((p, i) => (p.type === 'text' && p.text ? <Markdown key={i} text={p.text} /> : null))}
      </div>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-5 py-4 sm:py-8">
      <AssistantAvatar />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-balance">Como posso ajudar hoje?</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">
          Consulto vendas, anúncios, estoque e a Publicidade do Mercado Livre ao vivo. Anexe planilhas, PDFs ou prints e
          eu cruzo com o banco.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm leading-snug text-foreground/80 transition-colors hover:border-primary/60 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AssistantChat({
  conversationId,
  initialMessages,
}: {
  conversationId: string
  initialMessages: UIMessage[]
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [reading, setReading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const { messages, sendMessage, status } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/assistente',
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { id, message: messages[messages.length - 1] },
      }),
    }),
    onError: (err) => setErrorText(err.message || 'Não foi possível responder agora. Tente novamente.'),
    onFinish: () => {
      router.replace(`/assistente?c=${conversationId}`, { scroll: false })
      router.refresh()
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  const canSend = !busy && !reading && (input.trim().length > 0 || attachments.length > 0)
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => {
    if (status === 'submitted') bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [status])

  async function addFiles(list: FileList | null) {
    if (!list?.length) return
    setErrorText(null)
    const files = Array.from(list).slice(0, ATTACHMENT_LIMITS.maxFiles - attachments.length)
    if (files.length < list.length) setErrorText(`Máximo de ${ATTACHMENT_LIMITS.maxFiles} arquivos por mensagem.`)
    setReading(true)
    const read: Attachment[] = []
    for (const file of files) {
      try {
        read.push(await readAttachment(file))
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : `Não consegui ler ${file.name}.`)
      }
    }
    const next = [...attachments, ...read]
    const binary = next.reduce((sum, a) => sum + (a.type === 'file' ? a.size : 0), 0)
    if (binary > ATTACHMENT_LIMITS.maxBinaryBytes) {
      setErrorText('PDFs e imagens somam mais de 3 MB nesta mensagem. Envie em partes.')
    } else {
      setAttachments(next)
    }
    setReading(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  function send(text: string) {
    const t = text.trim()
    if ((!t && !attachments.length) || busy || reading) return
    setErrorText(null)
    const prompt = t || 'Analise os documentos anexados e cruze com os dados do banco.'
    sendMessage({
      role: 'user',
      parts: [
        ...attachments.map((a) => (a.type === 'file' ? a.part : { type: 'data-document' as const, data: a.data })),
        { type: 'text', text: prompt },
      ],
    })
    setInput('')
    setAttachments([])
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <div className="flex flex-1 flex-col gap-8 pb-6" aria-live="polite">
        {messages.length === 0 ? <EmptyState onPick={send} /> : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserMessage key={m.id} message={m} />
          ) : (
            <AssistantMessage key={m.id} message={m} running={busy && m.id === lastId} />
          ),
        )}
        {status === 'submitted' ? (
          <div className="flex items-center gap-3">
            <AssistantAvatar />
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Pensando…
            </span>
          </div>
        ) : null}
        {errorText ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {errorText}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-background via-background to-background/0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:mx-0 sm:px-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void addFiles(e.dataTransfer.files)
          }}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lg shadow-black/5 transition-colors focus-within:border-primary/60"
        >
          {attachments.length || reading ? (
            <div className="flex flex-wrap gap-2 px-1 pt-1">
              {attachments.map((a, i) => (
                <AttachmentChip
                  key={`${a.name}-${i}`}
                  name={a.name}
                  kind={attachmentKind(a)}
                  detail={a.type === 'document' && a.data.truncated ? 'cortado' : formatSize(a.size)}
                  onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              {reading ? (
                <span className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Lendo arquivo…
                </span>
              ) : null}
            </div>
          ) : null}
          <label htmlFor="assistant-input" className="sr-only">
            Pergunta
          </label>
          <textarea
            id="assistant-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={attachments.length ? 'O que quer saber sobre o anexo?' : 'Pergunte sobre vendas, Ads, preços…'}
            className="max-h-48 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-base leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground sm:text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              id="assistant-files"
              tabIndex={-1}
              onChange={(e) => void addFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={busy || reading || attachments.length >= ATTACHMENT_LIMITS.maxFiles}
              onClick={() => fileInput.current?.click()}
              aria-label="Anexar arquivo"
              title="Anexar PDF, imagem, Excel, Word, CSV ou TXT"
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="size-4" aria-hidden />
              <span className="hidden sm:inline">Anexar</span>
            </button>
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Enviar"
              className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
            </button>
          </div>
        </form>
        <p className="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
          Enter envia · Shift+Enter quebra linha
        </p>
      </div>
    </div>
  )
}

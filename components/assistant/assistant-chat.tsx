'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { ArrowUp, FileSpreadsheet, FileText, ImageIcon, Loader2, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { Markdown } from '@/components/assistant/markdown'
import { ATTACHMENT_LIMITS, type DocumentData } from '@/lib/assistant/attachments'
import { ATTACHMENT_ACCEPT, readAttachment, type Attachment } from '@/lib/assistant/read-attachment'

const SUGGESTIONS = [
  'O que devo fazer primeiro hoje?',
  'Quanto vendi nos últimos 7 dias no Mercado Livre?',
  'Quais anúncios estão sem estoque?',
  'Algum produto vendendo com margem negativa?',
]

const TOOL_LABEL: Record<string, string> = {
  'tool-resumoDoDia': 'Consultando KPIs do dia',
  'tool-vendasPorPeriodo': 'Consultando vendas no banco',
  'tool-maisVendidos': 'Consultando ranking de produtos',
  'tool-pedidos': 'Consultando pedidos',
  'tool-anuncios': 'Consultando anúncios',
  'tool-buscarProduto': 'Buscando produto',
  'tool-desempenhoCanais': 'Comparando canais',
  'tool-taxas': 'Lendo regras de taxa',
  'tool-integracoes': 'Verificando integrações',
  'tool-recomendacoes': 'Lendo recomendações do motor',
  'tool-alertas': 'Lendo alertas',
  'tool-testes': 'Lendo testes',
  'tool-memoria': 'Consultando memória estratégica',
  'tool-buscarConversas': 'Buscando em conversas anteriores',
  'tool-registrarMemoria': 'Registrando na memória',
}

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
    <span className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate text-foreground">{name}</span>
      {detail ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{detail}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
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
    <div className="flex flex-col items-end gap-2">
      {chips.length ? <div className="flex max-w-full flex-wrap justify-end gap-2">{chips}</div> : null}
      {text ? (
        <div className="whitespace-pre-wrap rounded-lg bg-surface-2 px-4 py-2.5 text-sm leading-relaxed">{text}</div>
      ) : null}
    </div>
  )
}

function AssistantMessage({ message }: { message: UIMessage }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {message.parts.map((p, i) => {
        if (p.type === 'text') return <Markdown key={i} text={p.text} />
        if (p.type.startsWith('tool-')) {
          const saved = p.type === 'tool-registrarMemoria'
          return (
            <span key={i} className={`font-mono text-[11px] ${saved ? 'text-primary' : 'text-muted-foreground'}`}>
              {TOOL_LABEL[p.type] ?? p.type}
            </span>
          )
        }
        return null
      })}
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
        ...attachments.map((a) =>
          a.type === 'file' ? a.part : { type: 'data-document' as const, data: a.data },
        ),
        { type: 'text', text: prompt },
      ],
    })
    setInput('')
    setAttachments([])
  }

  return (
    <div className="flex min-h-[60dvh] flex-col gap-6">
      <div className="flex flex-1 flex-col gap-8" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Pergunte sobre os dados ou anexe planilhas, PDFs e prints para análise. O assistente consulta o banco antes
              de responder e registra o que você decidir.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-md border border-border px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'max-w-[85%] self-end' : 'min-w-0 max-w-full'}>
            {m.role === 'user' ? <UserMessage message={m} /> : <AssistantMessage message={m} />}
          </div>
        ))}
        {status === 'submitted' ? (
          <span className="font-mono text-[11px] text-muted-foreground">Consultando o banco…</span>
        ) : null}
        {errorText ? <p className="text-sm text-critical">{errorText}</p> : null}
      </div>
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
        className="sticky bottom-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2"
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
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            id="assistant-files"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || reading || attachments.length >= ATTACHMENT_LIMITS.maxFiles}
            onClick={() => fileInput.current?.click()}
            aria-label="Anexar arquivo"
            title="Anexar PDF, imagem, Excel, Word, CSV ou TXT"
          >
            <Paperclip className="size-4" aria-hidden />
          </Button>
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
            placeholder={attachments.length ? 'O que quer saber sobre o anexo?' : 'Ex.: Vale baixar o preço do Deca Link no ML?'}
            className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm" disabled={!canSend} aria-label="Enviar">
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  )
}

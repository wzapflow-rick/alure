'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/primitives'

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

export function AssistantChat({
  conversationId,
  initialMessages,
}: {
  conversationId: string
  initialMessages: UIMessage[]
}) {
  const router = useRouter()
  const [input, setInput] = useState('')
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

  function send(text: string) {
    const t = text.trim()
    if (!t || busy) return
    setErrorText(null)
    sendMessage({ text: t })
    setInput('')
  }

  return (
    <div className="flex min-h-[60dvh] flex-col gap-6">
      <div className="flex flex-1 flex-col gap-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Pergunte sobre os dados. O assistente consulta o banco antes de responder e registra o que você decidir.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'max-w-[85%] self-end' : 'max-w-full'}>
            {m.role === 'user' ? (
              <div className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm leading-relaxed">
                {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {m.parts.map((p, i) => {
                  if (p.type === 'text') {
                    return (
                      <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-pretty">
                        {p.text}
                      </p>
                    )
                  }
                  if (p.type.startsWith('tool-')) {
                    const saved = p.type === 'tool-registrarMemoria'
                    return (
                      <span
                        key={i}
                        className={`font-mono text-[11px] ${saved ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        {TOOL_LABEL[p.type] ?? p.type}
                      </span>
                    )
                  }
                  return null
                })}
              </div>
            )}
          </div>
        ))}
        {status === 'submitted' ? <span className="font-mono text-[11px] text-muted-foreground">Consultando o banco…</span> : null}
        {errorText ? <p className="text-sm text-critical">{errorText}</p> : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-lg border border-border bg-surface p-2"
      >
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
          placeholder="Ex.: Vale baixar o preço do Deca Link no ML?"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" disabled={busy || !input.trim()} aria-label="Enviar">
          <ArrowUp className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  )
}

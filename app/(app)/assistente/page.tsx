import type { Metadata } from 'next'
import Link from 'next/link'
import type { UIMessage } from 'ai'
import { PageHeader } from '@/components/ui/primitives'
import { AssistantChat } from '@/components/assistant/assistant-chat'
import { requireUser } from '@/lib/session'
import {
  getConversationMessages,
  isAssistantStoreReady,
  listConversations,
  type ConversationRow,
} from '@/lib/assistant/store'

export const metadata: Metadata = { title: 'Assistente' }

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireUser()
  const { c } = await searchParams
  const ready = await isAssistantStoreReady()

  let conversations: ConversationRow[] = []
  let initialMessages: UIMessage[] = []
  let conversationId = crypto.randomUUID()

  if (ready) {
    conversations = await listConversations(user.id)
    if (c) {
      const loaded = await getConversationMessages(user.id, c)
      if (loaded) {
        conversationId = c
        initialMessages = loaded
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Assistente"
        description="Consulta o banco antes de responder, lembra de tudo que foi conversado e registra decisões na memória."
      />
      {!ready ? (
        <p role="alert" className="mb-6 max-w-3xl rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed">
          A memória do assistente ainda não está ativa. Rode o script{' '}
          <code className="font-mono text-xs">db/003_assistant_memory.sql</code> no pgAdmin para ativar.
        </p>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Conversas" className="flex flex-col gap-1 lg:sticky lg:top-6 lg:self-start">
          <Link
            href="/assistente"
            className="mb-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary"
          >
            Nova conversa
          </Link>
          {conversations.length ? (
            <ul className="flex flex-col gap-0.5">
              {conversations.map((conv) => {
                const active = conv.id === conversationId
                return (
                  <li key={conv.id}>
                    <Link
                      href={`/assistente?c=${conv.id}`}
                      aria-current={active ? 'page' : undefined}
                      className={`flex flex-col gap-0.5 rounded-md px-3 py-2 transition-colors hover:bg-surface-2 ${active ? 'bg-surface-2' : ''}`}
                    >
                      <span className="truncate text-sm">{conv.title || 'Sem título'}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatWhen(conv.updated_at)} · {conv.messages} msg
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-3 text-xs text-muted-foreground">Nenhuma conversa salva ainda.</p>
          )}
        </nav>
        <div className="max-w-3xl">
          <AssistantChat key={conversationId} conversationId={conversationId} initialMessages={initialMessages} />
        </div>
      </div>
    </>
  )
}

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

function ConversationList({ conversations, activeId }: { conversations: ConversationRow[]; activeId: string }) {
  if (!conversations.length) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conversa salva ainda.</p>
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {conversations.map((conv) => {
        const active = conv.id === activeId
        return (
          <li key={conv.id}>
            <Link
              href={`/assistente?c=${conv.id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2 ${active ? 'bg-surface-2' : ''}`}
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
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <div className="flex items-center gap-2 lg:hidden">
          <details className="group relative min-w-0 flex-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
              <span className="truncate">
                {conversations.find((cv) => cv.id === conversationId)?.title || 'Conversas'}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{conversations.length}</span>
            </summary>
            <nav
              aria-label="Conversas"
              className="absolute inset-x-0 top-full z-20 mt-2 max-h-[60dvh] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-xl"
            >
              <ConversationList conversations={conversations} activeId={conversationId} />
            </nav>
          </details>
          <Link
            href="/assistente"
            className="shrink-0 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Nova
          </Link>
        </div>
        <nav aria-label="Conversas" className="hidden flex-col gap-2 lg:sticky lg:top-6 lg:flex lg:self-start">
          <Link
            href="/assistente"
            className="rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Nova conversa
          </Link>
          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto">
            <ConversationList conversations={conversations} activeId={conversationId} />
          </div>
        </nav>
        <div className="min-w-0 max-w-3xl">
          <AssistantChat key={conversationId} conversationId={conversationId} initialMessages={initialMessages} />
        </div>
      </div>
    </>
  )
}

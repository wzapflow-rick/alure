import 'server-only'
import type { UIMessage } from 'ai'
import { query, queryOne } from '@/lib/db'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function isAssistantStoreReady() {
  try {
    const row = await queryOne<{ ok: boolean }>(
      `SELECT to_regclass('public.assistant_messages') IS NOT NULL
          AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'strategic_memory' AND column_name = 'source') AS ok`,
    )
    return Boolean(row?.ok)
  } catch {
    return false
  }
}

export type ConversationRow = { id: string; title: string | null; updated_at: string; messages: number }

export async function listConversations(userId: string, limit = 30) {
  return query<ConversationRow>(
    `SELECT c.id, c.title, c.updated_at,
            (SELECT COUNT(*)::int FROM assistant_messages m WHERE m.conversation_id = c.id) AS messages
       FROM assistant_conversations c
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC LIMIT $2`,
    [userId, limit],
  )
}

/** Returns null when the conversation does not exist or belongs to someone else. */
export async function getConversationMessages(userId: string, conversationId: string, limit = 60) {
  if (!UUID_RE.test(conversationId)) return null
  const owner = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM assistant_conversations WHERE id = $1',
    [conversationId],
  )
  if (!owner || owner.user_id !== userId) return null
  const rows = await query<{ id: string; role: 'user' | 'assistant'; parts: UIMessage['parts'] }>(
    `SELECT id, role, parts FROM (
       SELECT id, role, parts, created_at FROM assistant_messages
        WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [conversationId, limit],
  )
  return rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage)
}

/** Creates the conversation if needed and confirms the user owns it. */
export async function ensureConversation(userId: string, conversationId: string, title: string) {
  await query(
    `INSERT INTO assistant_conversations (id, user_id, title) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [conversationId, userId, title.slice(0, 120)],
  )
  const owner = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM assistant_conversations WHERE id = $1',
    [conversationId],
  )
  return owner?.user_id === userId
}

function textOf(message: UIMessage) {
  return message.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
}

export async function saveMessage(conversationId: string, message: UIMessage) {
  if (message.role !== 'user' && message.role !== 'assistant') return
  await query(
    `INSERT INTO assistant_messages (conversation_id, id, role, parts, content)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (conversation_id, id) DO UPDATE SET parts = EXCLUDED.parts, content = EXCLUDED.content`,
    [conversationId, message.id, message.role, JSON.stringify(message.parts), textOf(message)],
  )
  await query('UPDATE assistant_conversations SET updated_at = now() WHERE id = $1', [conversationId])
}

export async function searchConversations(userId: string, term: string, limit = 12) {
  return query<{ conversation_id: string; title: string | null; role: string; trecho: string; created_at: string }>(
    `SELECT m.conversation_id, c.title, m.role, LEFT(m.content, 600) AS trecho, m.created_at
       FROM assistant_messages m
       JOIN assistant_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1
        AND (to_tsvector('portuguese', m.content) @@ websearch_to_tsquery('portuguese', $2)
             OR m.content ILIKE '%' || $2 || '%')
      ORDER BY m.created_at DESC LIMIT $3`,
    [userId, term, limit],
  )
}

export async function recentConversationDigest(userId: string, excludeId: string, limit = 6) {
  return query<{ title: string | null; updated_at: string; ultima_pergunta: string | null }>(
    `SELECT c.title, c.updated_at,
            (SELECT LEFT(m.content, 200) FROM assistant_messages m
              WHERE m.conversation_id = c.id AND m.role = 'user'
              ORDER BY m.created_at DESC LIMIT 1) AS ultima_pergunta
       FROM assistant_conversations c
      WHERE c.user_id = $1 AND c.id <> $2
      ORDER BY c.updated_at DESC LIMIT $3`,
    [userId, excludeId, limit],
  )
}

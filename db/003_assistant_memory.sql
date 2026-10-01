-- 003 · Memória persistente do assistente
-- Conversas e mensagens ficam no banco; o que o assistente aprende vai para strategic_memory.

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx
  ON assistant_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  id              text NOT NULL,
  role            text NOT NULL CHECK (role IN ('user','assistant')),
  parts           jsonb NOT NULL,
  content         text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, id)
);
CREATE INDEX IF NOT EXISTS assistant_messages_conv_idx
  ON assistant_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS assistant_messages_fts_idx
  ON assistant_messages USING gin (to_tsvector('portuguese', content));

ALTER TABLE strategic_memory ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE strategic_memory ADD COLUMN IF NOT EXISTS conversation_id uuid
  REFERENCES assistant_conversations(id) ON DELETE SET NULL;

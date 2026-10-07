-- ALURE OS · 019 · Disparos para listas frias: duas etapas, cota de contatos frios e textos únicos.
-- Idempotente: pode rodar mais de uma vez.

-- Campanha em duas etapas: a abertura vai sem link; a oferta só vai para quem responder.
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS two_step           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_templates text[]  NOT NULL DEFAULT '{}';

ALTER TABLE broadcast_messages
  ADD COLUMN IF NOT EXISTS cold              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_text        text,
  ADD COLUMN IF NOT EXISTS reply_key_id      text,
  ADD COLUMN IF NOT EXISTS followup_status   text,
  ADD COLUMN IF NOT EXISTS followup_due_at   timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS followup_rendered text,
  ADD COLUMN IF NOT EXISTS followup_error    text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_messages_followup_status_chk') THEN
    ALTER TABLE broadcast_messages ADD CONSTRAINT broadcast_messages_followup_status_chk
      CHECK (followup_status IS NULL OR followup_status IN ('pending','sending','sent','failed','skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS broadcast_messages_followup_idx
  ON broadcast_messages (followup_due_at) WHERE followup_status = 'pending';
-- Busca rápida de textos já enviados (nenhuma mensagem sai idêntica a outra recente).
CREATE INDEX IF NOT EXISTS broadcast_messages_rendered_md5_idx
  ON broadcast_messages (md5(rendered)) WHERE rendered IS NOT NULL;
CREATE INDEX IF NOT EXISTS broadcast_messages_followup_md5_idx
  ON broadcast_messages (md5(followup_rendered)) WHERE followup_rendered IS NOT NULL;

-- Regras para contatos frios (vindos da Prospecção e que nunca responderam).
ALTER TABLE broadcast_settings
  ADD COLUMN IF NOT EXISTS cold_share_pct        smallint NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cold_delay_pct        smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cold_require_two_step boolean  NOT NULL DEFAULT true;

-- Conferência
SELECT cold_share_pct, cold_delay_pct, cold_require_two_step,
       (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'broadcast_messages' AND column_name IN ('cold','followup_status','followup_rendered','reply_key_id')) AS colunas_novas_mensagens,
       (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = 'broadcast_campaigns' AND column_name IN ('two_step','followup_templates')) AS colunas_novas_campanhas
  FROM broadcast_settings WHERE id = 1;

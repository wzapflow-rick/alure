-- ALURE OS · 005 · Automação comercial no motor
-- Estoque por anúncio (vem do Mercado Livre na sincronização) e acompanhamento do resultado
-- das decisões registradas na memória estratégica. Idempotente.

ALTER TABLE product_channels
  ADD COLUMN IF NOT EXISTS available_quantity integer CHECK (available_quantity >= 0),
  ADD COLUMN IF NOT EXISTS stock_synced_at    timestamptz;

ALTER TABLE strategic_memory
  ADD COLUMN IF NOT EXISTS recommendation_id  bigint REFERENCES recommendations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_channel_id bigint REFERENCES product_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_date        date,
  ADD COLUMN IF NOT EXISTS outcome            text,
  ADD COLUMN IF NOT EXISTS outcome_data       jsonb,
  ADD COLUMN IF NOT EXISTS outcome_at         timestamptz;

CREATE INDEX IF NOT EXISTS strategic_memory_pending_outcome_idx
  ON strategic_memory(review_date)
  WHERE outcome IS NULL AND recommendation_id IS NOT NULL;

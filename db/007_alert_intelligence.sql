-- ALURE OS · 007 · Inteligência de alertas e concorrência
-- 1. Alertas ganham o estado DISMISSED (descartado) além de OPEN / ACKNOWLEDGED / RESOLVED.
-- 2. Observações de preço de concorrentes, usadas pelo motor como FATO (nunca como prova de venda perdida).
-- Idempotente: pode ser executado mais de uma vez.

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_status_check
  CHECK (status IN ('open','acknowledged','resolved','dismissed'));

CREATE TABLE IF NOT EXISTS competitor_offers (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_channel_id bigint NOT NULL REFERENCES product_channels(id) ON DELETE CASCADE,
  competitor_name    text NOT NULL,
  price              numeric(12,2) NOT NULL CHECK (price > 0),
  free_shipping      boolean,
  observed_on        date NOT NULL DEFAULT CURRENT_DATE,
  source             text NOT NULL DEFAULT 'manual',
  url                text,
  notes              text,
  created_by         text REFERENCES "user"(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS competitor_offers_channel_idx
  ON competitor_offers(product_channel_id, observed_on DESC);

-- 3. Histórico de cada alerta: quando surgiu, escalou, foi visto, resolvido ou descartado.
--    Base para medir depois quantos viraram ação, quantos foram ignorados e quantos eram falsos positivos.
CREATE TABLE IF NOT EXISTS alert_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id   bigint NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  event      text NOT NULL CHECK (event IN ('created','escalated','reopened','acknowledged','resolved','dismissed','auto_resolved')),
  severity   text,
  user_id    text REFERENCES "user"(id),
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_events_alert_idx ON alert_events(alert_id, created_at DESC);

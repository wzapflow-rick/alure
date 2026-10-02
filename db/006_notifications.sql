-- ALURE OS · 006 · Avisos no WhatsApp (Evolution API)
-- Estado dos níveis de estoque já avisados, histórico de envios e lembretes recorrentes. Idempotente.

CREATE TABLE IF NOT EXISTS stock_alert_state (
  product_channel_id bigint PRIMARY KEY REFERENCES product_channels(id) ON DELETE CASCADE,
  level              smallint NOT NULL CHECK (level BETWEEN 0 AND 3),
  stock              integer,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('stock','opportunity','reminder','test')),
  channel     text NOT NULL DEFAULT 'whatsapp',
  message     text NOT NULL,
  status      text NOT NULL CHECK (status IN ('sent','error')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_log_created_idx ON notification_log(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reminders (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL,
  message      text,
  weekdays     smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  hour         smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  active       boolean NOT NULL DEFAULT true,
  last_sent_on date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Lembretes iniciais (dias: 0 = domingo … 6 = sábado). Podem ser editados ou desativados em Configurações.
INSERT INTO notification_reminders (title, message, weekdays, hour)
SELECT * FROM (VALUES
  ('Cadastrar custo dos produtos novos', 'Confira em Produtos quem está sem custo cadastrado. Sem custo, o motor não calcula margem.', '{1}'::smallint[], 9::smallint),
  ('Revisar testes e decisões vencendo', 'Abra Oportunidades e Memória: veja testes prontos para avaliação e decisões com revisão para esta semana.', '{1,4}'::smallint[], 10::smallint),
  ('Conferir preço dos concorrentes nos mais vendidos', 'Pesquise os 5 produtos que mais vendem no Mercado Livre e compare preço, frete e prazo com os concorrentes.', '{3}'::smallint[], 14::smallint)
) AS seed(title, message, weekdays, hour)
WHERE NOT EXISTS (SELECT 1 FROM notification_reminders);

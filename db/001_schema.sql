-- ALURE OS — schema inicial (PostgreSQL 13+)
-- Execute no Query Tool do pgAdmin, conectado ao banco do ALURE OS.
-- Idempotente: pode ser executado mais de uma vez.

BEGIN;

-- =========================================================
-- Autenticação (Better Auth) — tabela "user" = usuários do sistema
-- =========================================================
CREATE TABLE IF NOT EXISTS "user" (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image           text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id          text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_idx ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  id                      text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_idx ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification"(identifier);

-- =========================================================
-- Marketplaces e conexões
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplaces (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO marketplaces (code, name) VALUES
  ('mercado_livre', 'Mercado Livre'),
  ('shopee', 'Shopee'),
  ('upseller', 'UpSeller')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS marketplace_connections (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id      bigint NOT NULL REFERENCES marketplaces(id),
  status              text NOT NULL DEFAULT 'not_connected'
                      CHECK (status IN ('not_connected','connected','expired','error')),
  external_account_id text,
  account_name        text,
  access_token_enc    text,
  refresh_token_enc   text,
  token_expires_at    timestamptz,
  scopes              text[],
  connected_by        text REFERENCES "user"(id),
  connected_at        timestamptz,
  last_error          text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_id, external_account_id)
);

-- =========================================================
-- Produtos, canais e custos
-- =========================================================
CREATE TABLE IF NOT EXISTS products (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku                   text NOT NULL UNIQUE,
  name                  text NOT NULL,
  brand                 text NOT NULL DEFAULT 'Deca',
  category              text,
  classification        text NOT NULL DEFAULT 'sem_classificacao'
                        CHECK (classification IN ('motor_de_giro','produto_de_margem','alto_ticket','em_teste','observacao','sem_classificacao')),
  classification_reason text,
  active                boolean NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_channels (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  marketplace_id   bigint NOT NULL REFERENCES marketplaces(id),
  external_id      text,
  listing_title    text,
  listing_url      text,
  current_price    numeric(12,2) NOT NULL CHECK (current_price >= 0),
  ads_cost_pct     numeric(6,2) NOT NULL DEFAULT 0 CHECK (ads_cost_pct >= 0),
  seller_discount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (seller_discount >= 0),
  promotion_active boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_channels_product_idx ON product_channels(product_id);
CREATE INDEX IF NOT EXISTS product_channels_marketplace_idx ON product_channels(marketplace_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_channels_external_uidx
  ON product_channels(marketplace_id, external_id) WHERE external_id IS NOT NULL;

-- Histórico de lotes de custo (cada compra/entrada)
CREATE TABLE IF NOT EXISTS product_cost_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_cost      numeric(12,4) NOT NULL CHECK (unit_cost >= 0),
  effective_date date NOT NULL,
  supplier       text,
  notes          text,
  active         boolean NOT NULL DEFAULT true,
  created_by     text REFERENCES "user"(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_cost_history_product_idx ON product_cost_history(product_id, effective_date DESC);

-- Custo vigente consolidado (média ponderada dos lotes ativos)
CREATE TABLE IF NOT EXISTS product_costs (
  product_id          bigint PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  acquisition_cost    numeric(12,4) NOT NULL,
  average_cost        numeric(12,4) NOT NULL,
  cost_effective_date date NOT NULL,
  supplier            text,
  notes               text,
  active              boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- Pedidos e métricas (preenchidos pela sincronização)
-- =========================================================
CREATE TABLE IF NOT EXISTS orders (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id bigint NOT NULL REFERENCES marketplaces(id),
  external_id    text NOT NULL,
  status         text NOT NULL,
  order_date     timestamptz NOT NULL,
  total_amount   numeric(12,2) NOT NULL,
  currency       text NOT NULL DEFAULT 'BRL',
  source         text NOT NULL,
  raw            jsonb,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_id, external_id)
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders(order_date DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id           bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id         bigint REFERENCES products(id),
  product_channel_id bigint REFERENCES product_channels(id),
  external_item_id   text NOT NULL,
  sku                text,
  quantity           integer NOT NULL CHECK (quantity > 0),
  unit_price         numeric(12,2) NOT NULL,
  total              numeric(12,2) NOT NULL,
  UNIQUE (order_id, external_item_id)
);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);
CREATE INDEX IF NOT EXISTS order_items_sku_idx ON order_items(sku);

CREATE TABLE IF NOT EXISTS sales_metrics (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_channel_id bigint NOT NULL REFERENCES product_channels(id) ON DELETE CASCADE,
  metric_date        date NOT NULL,
  orders             integer NOT NULL DEFAULT 0,
  units              integer NOT NULL DEFAULT 0,
  revenue            numeric(12,2) NOT NULL DEFAULT 0,
  source             text NOT NULL,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_channel_id, metric_date)
);
CREATE INDEX IF NOT EXISTS sales_metrics_date_idx ON sales_metrics(metric_date);

CREATE TABLE IF NOT EXISTS traffic_metrics (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_channel_id bigint NOT NULL REFERENCES product_channels(id) ON DELETE CASCADE,
  metric_date        date NOT NULL,
  visits             integer NOT NULL DEFAULT 0,
  unique_visitors    integer,
  source             text NOT NULL,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_channel_id, metric_date)
);
CREATE INDEX IF NOT EXISTS traffic_metrics_date_idx ON traffic_metrics(metric_date);

-- =========================================================
-- Publicidade e promoções
-- =========================================================
CREATE TABLE IF NOT EXISTS advertising_campaigns (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id bigint NOT NULL REFERENCES marketplaces(id),
  external_id    text NOT NULL,
  name           text NOT NULL,
  status         text,
  daily_budget   numeric(12,2),
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_id, external_id)
);

CREATE TABLE IF NOT EXISTS advertising_metrics (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id        bigint NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
  product_channel_id bigint REFERENCES product_channels(id) ON DELETE CASCADE,
  metric_date        date NOT NULL,
  impressions        integer,
  clicks             integer,
  cost               numeric(12,2),
  attributed_sales   integer,
  indirect_sales     integer,
  attributed_revenue numeric(12,2),
  impression_share   numeric(6,2),
  lost_by_budget     numeric(6,2),
  lost_by_rank       numeric(6,2),
  raw                jsonb,
  synced_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS advertising_metrics_uidx
  ON advertising_metrics(campaign_id, COALESCE(product_channel_id, 0), metric_date);
CREATE INDEX IF NOT EXISTS advertising_metrics_date_idx ON advertising_metrics(metric_date);

CREATE TABLE IF NOT EXISTS promotions (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id bigint NOT NULL REFERENCES marketplaces(id),
  external_id    text,
  name           text NOT NULL,
  promo_type     text,
  status         text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  seller_funded  boolean,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS promotions_external_uidx
  ON promotions(marketplace_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS promotion_products (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  promotion_id       bigint NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_channel_id bigint NOT NULL REFERENCES product_channels(id) ON DELETE CASCADE,
  promo_price        numeric(12,2),
  seller_discount    numeric(12,2),
  UNIQUE (promotion_id, product_channel_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_channel_id bigint NOT NULL REFERENCES product_channels(id) ON DELETE CASCADE,
  previous_price     numeric(12,2),
  price              numeric(12,2) NOT NULL,
  source             text NOT NULL CHECK (source IN ('manual','sync','experiment')),
  reason             text,
  changed_by         text REFERENCES "user"(id),
  changed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_history_channel_idx ON price_history(product_channel_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_channel_id bigint NOT NULL REFERENCES product_channels(id) ON DELETE CASCADE,
  quantity           integer NOT NULL,
  source             text NOT NULL,
  snapshot_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_snapshots_channel_idx ON inventory_snapshots(product_channel_id, snapshot_at DESC);

-- =========================================================
-- Taxas de marketplace (versionadas por data)
-- Percentuais em pontos percentuais: 14.00 = 14%
-- =========================================================
CREATE TABLE IF NOT EXISTS fee_rules (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id       bigint NOT NULL REFERENCES marketplaces(id),
  name                 text NOT NULL,
  percentage_fee       numeric(6,2) NOT NULL DEFAULT 0 CHECK (percentage_fee >= 0),
  fixed_fee            numeric(12,2) NOT NULL DEFAULT 0 CHECK (fixed_fee >= 0),
  additional_fee_pct   numeric(6,2) NOT NULL DEFAULT 0 CHECK (additional_fee_pct >= 0),
  additional_fixed_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (additional_fixed_fee >= 0),
  min_price            numeric(12,2),
  max_price            numeric(12,2),
  category             text,
  listing_type         text,
  conditions           jsonb,
  effective_from       date NOT NULL,
  effective_to         date,
  active               boolean NOT NULL DEFAULT true,
  notes                text,
  created_by           text REFERENCES "user"(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (min_price IS NULL OR max_price IS NULL OR max_price >= min_price)
);
CREATE INDEX IF NOT EXISTS fee_rules_marketplace_idx ON fee_rules(marketplace_id, effective_from DESC);

-- =========================================================
-- Testes comerciais
-- =========================================================
CREATE TABLE IF NOT EXISTS experiments (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id           bigint NOT NULL REFERENCES products(id),
  product_channel_id   bigint REFERENCES product_channels(id),
  marketplace_id       bigint NOT NULL REFERENCES marketplaces(id),
  variable             text NOT NULL CHECK (variable IN ('price','title','images','description','promotion','ads','shipping','other')),
  previous_value       text NOT NULL,
  new_value            text NOT NULL,
  hypothesis           text NOT NULL,
  start_date           date NOT NULL,
  evaluation_date      date NOT NULL,
  primary_metric       text NOT NULL,
  secondary_metrics    text[] NOT NULL DEFAULT '{}',
  status               text NOT NULL DEFAULT 'in_progress'
                       CHECK (status IN ('planned','in_progress','ready_for_review','completed','cancelled')),
  result               text,
  recommended_decision text CHECK (recommended_decision IN ('keep','revert','continue','new_test')),
  decision             text CHECK (decision IN ('keep','revert','continue','new_test')),
  decision_notes       text,
  decided_by           text REFERENCES "user"(id),
  decided_at           timestamptz,
  created_by           text REFERENCES "user"(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (evaluation_date >= start_date)
);
CREATE INDEX IF NOT EXISTS experiments_product_idx ON experiments(product_id);
CREATE INDEX IF NOT EXISTS experiments_status_idx ON experiments(status, evaluation_date);

CREATE TABLE IF NOT EXISTS experiment_metrics (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  experiment_id bigint NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  period        text NOT NULL CHECK (period IN ('baseline','test')),
  metric        text NOT NULL,
  value         numeric(14,4),
  captured_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, period, metric)
);

-- =========================================================
-- Recomendações e alertas (motor determinístico)
-- =========================================================
CREATE TABLE IF NOT EXISTS recommendations (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fingerprint        text NOT NULL UNIQUE,
  rule_code          text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('priority','opportunity','test_review','no_action')),
  severity           text NOT NULL CHECK (severity IN ('critical','attention','info','positive')),
  action_type        text NOT NULL CHECK (action_type IN ('information','recommendation','approval_required')),
  confidence         text NOT NULL CHECK (confidence IN ('low','medium','high')),
  priority_score     integer NOT NULL DEFAULT 0,
  product_id         bigint REFERENCES products(id) ON DELETE CASCADE,
  product_channel_id bigint REFERENCES product_channels(id) ON DELETE CASCADE,
  marketplace_id     bigint REFERENCES marketplaces(id),
  experiment_id      bigint REFERENCES experiments(id) ON DELETE CASCADE,
  title              text NOT NULL,
  issue              text NOT NULL,
  evidence           jsonb NOT NULL DEFAULT '[]',
  recommendation     text NOT NULL,
  reason             text NOT NULL,
  objective          text NOT NULL,
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','approved','rejected','dismissed','resolved')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);
CREATE INDEX IF NOT EXISTS recommendations_status_idx ON recommendations(status, priority_score DESC);
CREATE INDEX IF NOT EXISTS recommendations_product_idx ON recommendations(product_id);

CREATE TABLE IF NOT EXISTS recommendation_events (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recommendation_id bigint NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  event             text NOT NULL,
  note              text,
  user_id           text REFERENCES "user"(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recommendation_events_rec_idx ON recommendation_events(recommendation_id);

CREATE TABLE IF NOT EXISTS alerts (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fingerprint        text NOT NULL UNIQUE,
  alert_type         text NOT NULL,
  severity           text NOT NULL CHECK (severity IN ('critical','attention','info','positive')),
  product_id         bigint REFERENCES products(id) ON DELETE CASCADE,
  product_channel_id bigint REFERENCES product_channels(id) ON DELETE CASCADE,
  marketplace_id     bigint REFERENCES marketplaces(id),
  experiment_id      bigint REFERENCES experiments(id) ON DELETE CASCADE,
  message            text NOT NULL,
  data               jsonb,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by    text REFERENCES "user"(id),
  acknowledged_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status, created_at DESC);

-- =========================================================
-- Memória estratégica
-- =========================================================
CREATE TABLE IF NOT EXISTS strategic_memory (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  memory_date     date NOT NULL DEFAULT CURRENT_DATE,
  kind            text NOT NULL DEFAULT 'decision' CHECK (kind IN ('decision','rule','context')),
  subject         text NOT NULL,
  decision        text NOT NULL,
  reason          text,
  expected_result text,
  product_id      bigint REFERENCES products(id) ON DELETE SET NULL,
  marketplace_id  bigint REFERENCES marketplaces(id),
  experiment_id   bigint REFERENCES experiments(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','archived')),
  user_id         text REFERENCES "user"(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategic_memory_product_idx ON strategic_memory(product_id);
CREATE INDEX IF NOT EXISTS strategic_memory_date_idx ON strategic_memory(memory_date DESC);

-- =========================================================
-- Configurações, brief diário, sincronização e auditoria
-- =========================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by text REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  summary_date date NOT NULL UNIQUE,
  revenue      numeric(12,2),
  orders       integer,
  aov          numeric(12,2),
  target       numeric(12,2),
  content      jsonb NOT NULL,
  generated_by text REFERENCES "user"(id),
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id    bigint NOT NULL REFERENCES marketplaces(id),
  job_type          text NOT NULL,
  status            text NOT NULL CHECK (status IN ('pending','running','success','error','skipped')),
  started_at        timestamptz,
  finished_at       timestamptz,
  records_processed integer NOT NULL DEFAULT 0,
  cursor            jsonb,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_jobs_marketplace_idx ON sync_jobs(marketplace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     text REFERENCES "user"(id) ON DELETE SET NULL,
  user_email  text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  reason      text
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

COMMIT;

-- ALURE OS · 013 · Disparos no WhatsApp (Evolution API) com barreiras anti-bloqueio.
-- Idempotente: pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS broadcast_settings (
  id                       smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paused_all               boolean  NOT NULL DEFAULT false,
  min_delay_s              integer  NOT NULL DEFAULT 75,
  max_delay_s              integer  NOT NULL DEFAULT 180,
  batch_min                integer  NOT NULL DEFAULT 8,
  batch_max                integer  NOT NULL DEFAULT 15,
  batch_pause_min_s        integer  NOT NULL DEFAULT 600,
  batch_pause_max_s        integer  NOT NULL DEFAULT 1500,
  long_break_chance        smallint NOT NULL DEFAULT 5,
  hourly_cap               integer  NOT NULL DEFAULT 25,
  daily_cap                integer  NOT NULL DEFAULT 150,
  window_start_hour        smallint NOT NULL DEFAULT 9,
  window_end_hour          smallint NOT NULL DEFAULT 19,
  weekdays                 smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  warmup_enabled           boolean  NOT NULL DEFAULT true,
  warmup_start             integer  NOT NULL DEFAULT 20,
  warmup_step              integer  NOT NULL DEFAULT 10,
  warmup_started_on        date,
  contact_cooldown_days    integer  NOT NULL DEFAULT 30,
  max_consecutive_failures smallint NOT NULL DEFAULT 3,
  max_error_rate           smallint NOT NULL DEFAULT 20,
  max_invalid_rate         smallint NOT NULL DEFAULT 30,
  typing_enabled           boolean  NOT NULL DEFAULT true,
  opt_out_keywords         text[]   NOT NULL DEFAULT '{sair,parar,pare,stop,cancelar,descadastrar,remover}',
  tick_lock_until          timestamptz,
  last_tick_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO broadcast_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone         text NOT NULL UNIQUE,
  name          text,
  tags          text[] NOT NULL DEFAULT '{}',
  source        text,
  opted_out     boolean NOT NULL DEFAULT false,
  opted_out_at  timestamptz,
  wa_exists     boolean,
  wa_checked_at timestamptz,
  last_sent_at  timestamptz,
  last_reply_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broadcast_contacts_tags_idx ON broadcast_contacts USING gin (tags);

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','running','paused','completed','cancelled')),
  templates            text[] NOT NULL,
  link_url             text,
  append_link          boolean NOT NULL DEFAULT true,
  opt_out_footer       boolean NOT NULL DEFAULT true,
  tag_filter           text,
  next_send_at         timestamptz,
  batch_sent           integer NOT NULL DEFAULT 0,
  batch_target         integer NOT NULL DEFAULT 10,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_variant         smallint,
  pause_reason         text,
  started_at           timestamptz,
  finished_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
-- Trava no próprio banco: só uma campanha pode estar enviando por vez.
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_one_running_idx ON broadcast_campaigns ((true)) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id  bigint NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  contact_id   bigint NOT NULL REFERENCES broadcast_contacts(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','sending','sent','failed','skipped')),
  skip_reason  text,
  variant      smallint,
  rendered     text,
  error        text,
  attempted_at timestamptz,
  sent_at      timestamptz,
  replied_at   timestamptz,
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS broadcast_messages_queue_idx   ON broadcast_messages (campaign_id, status, position);
CREATE INDEX IF NOT EXISTS broadcast_messages_sent_idx    ON broadcast_messages (sent_at DESC) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS broadcast_messages_contact_idx ON broadcast_messages (contact_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broadcast_events_created_idx ON broadcast_events (created_at DESC);

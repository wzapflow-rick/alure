-- ALURE OS · 014 · Prospecção (SerpAPI / Google Maps) + verificação de WhatsApp + listas para Disparos.
-- Idempotente: pode rodar mais de uma vez. Depende do 013_disparos.sql.

CREATE TABLE IF NOT EXISTS prospect_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  wa_check_enabled  boolean  NOT NULL DEFAULT true,
  site_scan_enabled boolean  NOT NULL DEFAULT true,
  auto_check        boolean  NOT NULL DEFAULT true,
  require_whatsapp  boolean  NOT NULL DEFAULT true,
  daily_check_cap   integer  NOT NULL DEFAULT 400,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO prospect_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS prospect_searches (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query      text NOT NULL,
  location   text,
  pages      smallint NOT NULL DEFAULT 1,
  found      integer NOT NULL DEFAULT 0,
  created    integer NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'done' CHECK (status IN ('running','done','failed')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  place_id        text NOT NULL UNIQUE,
  search_id       bigint REFERENCES prospect_searches(id) ON DELETE SET NULL,
  name            text NOT NULL,
  category        text,
  address         text,
  phone_raw       text,
  phone           text,
  website         text,
  rating          numeric(2,1),
  reviews         integer,
  site_whatsapp   text,
  site_checked_at timestamptz,
  wa_status       text NOT NULL DEFAULT 'pending'
                  CHECK (wa_status IN ('pending','yes','no','no_phone','error')),
  wa_checked_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospects_search_idx  ON prospects (search_id);
CREATE INDEX IF NOT EXISTS prospects_status_idx  ON prospects (wa_status);
CREATE INDEX IF NOT EXISTS prospects_checked_idx ON prospects (wa_checked_at DESC);

CREATE TABLE IF NOT EXISTS prospect_lists (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  tag            text NOT NULL UNIQUE,
  exported_at    timestamptz,
  exported_count integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_list_items (
  list_id     bigint NOT NULL REFERENCES prospect_lists(id) ON DELETE CASCADE,
  prospect_id bigint NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, prospect_id)
);

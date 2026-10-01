-- ALURE OS — 002: análise autônoma
-- Execute no Query Tool do pgAdmin, conectado ao banco "alure", DEPOIS do 001.
-- Idempotente: pode ser executado mais de uma vez.

BEGIN;

-- 1. Classificação estratégica: nova opção "sazonal"
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_classification_check;
ALTER TABLE products ADD CONSTRAINT products_classification_check
  CHECK (classification IN ('motor_de_giro','produto_de_margem','alto_ticket','em_teste','sazonal','observacao','sem_classificacao'));

-- 2. Execuções da análise (automática após sync, agendada, ao abrir ou manual)
CREATE TABLE IF NOT EXISTS analysis_runs (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  analysis_date       date NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('sync','scheduled','on_open','manual')),
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  channels_analyzed   integer NOT NULL DEFAULT 0,
  signals             integer NOT NULL DEFAULT 0,
  created             integer NOT NULL DEFAULT 0,
  resolved            integer NOT NULL DEFAULT 0,
  protected_by_tests  integer NOT NULL DEFAULT 0,
  health              jsonb NOT NULL DEFAULT '[]',
  error               text,
  triggered_by        text REFERENCES "user"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS analysis_runs_started_idx ON analysis_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS analysis_runs_status_idx ON analysis_runs(status, analysis_date DESC);

-- 3. Evidências estruturadas ("Ver evidências") e vínculo com a execução
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS evidence_data jsonb NOT NULL DEFAULT '[]';
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS analysis_run_id bigint REFERENCES analysis_runs(id) ON DELETE SET NULL;

-- 4. Leitura diária vinculada à execução que a gerou
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS analysis_run_id bigint REFERENCES analysis_runs(id) ON DELETE SET NULL;

COMMIT;

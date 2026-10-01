-- ALURE OS · 004 · Camada de IA (observabilidade das chamadas)
-- Idempotente. Não altera tabelas existentes nem apaga dados.
-- A análise interpretada é salva dentro de daily_summaries.content->'ai' (sem mudança de schema).
BEGIN;

CREATE TABLE IF NOT EXISTS ai_calls (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  task             text NOT NULL,
  tier             text NOT NULL CHECK (tier IN ('fast','default','deep')),
  provider         text NOT NULL,
  model            text NOT NULL,
  status           text NOT NULL CHECK (status IN ('success','error','invalid')),
  duration_ms      integer,
  input_tokens     integer,
  output_tokens    integer,
  cost_usd         numeric(12,6),
  analysis_run_id  bigint REFERENCES analysis_runs(id) ON DELETE SET NULL,
  user_id          text REFERENCES "user"(id) ON DELETE SET NULL,
  context_summary  jsonb,
  validation       jsonb,
  error            text
);

CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON ai_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_task_idx ON ai_calls(task, created_at DESC);

COMMIT;

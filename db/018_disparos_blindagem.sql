-- ALURE OS · 018 · Blindagem dos disparos: aquecimento por mérito, incidentes e quarentena.
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE broadcast_settings
  ADD COLUMN IF NOT EXISTS ramp_cap          integer,
  ADD COLUMN IF NOT EXISTS ramp_evaluated_on date,
  ADD COLUMN IF NOT EXISTS quarantine_until  timestamptz,
  ADD COLUMN IF NOT EXISTS quarantine_hours  integer  NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS incident_cut_pct  smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS min_reply_rate    smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_state        text,
  ADD COLUMN IF NOT EXISTS last_state_at     timestamptz;

CREATE TABLE IF NOT EXISTS broadcast_incidents (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind             text NOT NULL,
  detail           text,
  ramp_before      integer,
  ramp_after       integer,
  quarantine_until timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS broadcast_incidents_created_idx ON broadcast_incidents (created_at DESC);

-- O limite diário passa a ser guardado (não mais calculado pelo calendário).
UPDATE broadcast_settings SET ramp_cap = LEAST(daily_cap, warmup_start) WHERE id = 1 AND ramp_cap IS NULL;

-- Registra a queda de conexão que já aconteceu (só na primeira vez que o script roda):
-- limite volta para o inicial e o número fica 72h em quarentena.
WITH ins AS (
  INSERT INTO broadcast_incidents (kind, detail, ramp_before, ramp_after, quarantine_until)
  SELECT 'desconexao',
         'Queda registrada na instalação da blindagem: todos os aparelhos foram desconectados no dia com 40 envios.',
         40, LEAST(daily_cap, warmup_start), now() + interval '72 hours'
    FROM broadcast_settings
   WHERE id = 1 AND NOT EXISTS (SELECT 1 FROM broadcast_incidents)
  RETURNING ramp_after, quarantine_until
)
UPDATE broadcast_settings s
   SET ramp_cap = ins.ramp_after, quarantine_until = ins.quarantine_until, updated_at = now()
  FROM ins
 WHERE s.id = 1;

-- Campanhas que estavam enviando ficam pausadas até o fim da quarentena.
UPDATE broadcast_campaigns SET status = 'paused', pause_reason = 'incidente'
 WHERE status = 'running'
   AND EXISTS (SELECT 1 FROM broadcast_settings WHERE id = 1 AND quarantine_until > now());

-- Conferência
SELECT ramp_cap, daily_cap, quarantine_until, quarantine_hours, incident_cut_pct, min_reply_rate,
       (SELECT COUNT(*) FROM broadcast_incidents) AS incidentes
  FROM broadcast_settings WHERE id = 1;

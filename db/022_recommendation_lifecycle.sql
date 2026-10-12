-- ALURE OS · 022 · Ciclo de vida das recomendações
-- Reaproveita recommendations + recommendation_events + strategic_memory (medição).
-- Adiciona responsável, datas de aprovação/execução, período de avaliação e aprendizado.
-- Idempotente.

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS owner          text,
  ADD COLUMN IF NOT EXISTS approved_at    date,
  ADD COLUMN IF NOT EXISTS started_at     date,
  ADD COLUMN IF NOT EXISTS executed_at    date,
  ADD COLUMN IF NOT EXISTS execution_note text,
  ADD COLUMN IF NOT EXISTS review_date    date,
  ADD COLUMN IF NOT EXISTS learning       text,
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz;

ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_status_check;
ALTER TABLE recommendations ADD CONSTRAINT recommendations_status_check
  CHECK (status IN ('open','approved','in_progress','awaiting_review','completed','cancelled','rejected','dismissed','resolved'));

-- Data de aprovação das recomendações já aprovadas, a partir do histórico existente.
UPDATE recommendations r
   SET approved_at = e.approved_on
  FROM (SELECT recommendation_id, MAX(created_at)::date AS approved_on
          FROM recommendation_events WHERE event = 'approved' GROUP BY recommendation_id) e
 WHERE e.recommendation_id = r.id AND r.approved_at IS NULL;

CREATE INDEX IF NOT EXISTS recommendations_review_idx
  ON recommendations(review_date) WHERE status = 'awaiting_review';

-- Conferência
SELECT status, COUNT(*) AS total, COUNT(approved_at) AS com_data_aprovacao, COUNT(executed_at) AS executadas
  FROM recommendations GROUP BY status ORDER BY status;

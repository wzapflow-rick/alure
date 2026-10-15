-- ALURE OS · 024 · Boletos recorrentes (contas que se repetem todo mês)
-- Idempotente: pode ser rodado mais de uma vez.

ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bills_recurring_idx
  ON bills (lower(beneficiary), category, due_date) WHERE is_recurring;

-- Conferência
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'bills' AND column_name = 'is_recurring';

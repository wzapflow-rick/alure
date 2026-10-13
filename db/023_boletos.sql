-- ALURE OS · 023 · Gestão de boletos (contas a pagar e dívidas)
-- Idempotente: pode ser rodado mais de uma vez.

CREATE TABLE IF NOT EXISTS bills (
  id                 bigserial PRIMARY KEY,
  beneficiary        text          NOT NULL,
  description        text,
  category           text          NOT NULL DEFAULT 'outros',
  amount             numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_date           date          NOT NULL,
  digitable_line     text,
  document_number    text,
  installment_number integer CHECK (installment_number IS NULL OR installment_number > 0),
  installment_total  integer CHECK (installment_total IS NULL OR installment_total > 0),
  group_id           uuid,
  status             text          NOT NULL DEFAULT 'open',
  paid_at            date,
  paid_amount        numeric(14,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  payment_note       text,
  file_pathname      text,
  file_name          text,
  file_type          text,
  notes              text,
  created_by         text,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_status_check;
ALTER TABLE bills ADD CONSTRAINT bills_status_check CHECK (status IN ('open','paid','cancelled'));

CREATE INDEX IF NOT EXISTS bills_status_due_idx  ON bills (status, due_date);
CREATE INDEX IF NOT EXISTS bills_beneficiary_idx ON bills (lower(beneficiary)) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS bills_group_idx       ON bills (group_id) WHERE group_id IS NOT NULL;

-- Evita cadastrar o mesmo boleto duas vezes (cancelados não contam).
CREATE UNIQUE INDEX IF NOT EXISTS bills_digitable_line_uidx
  ON bills (digitable_line) WHERE digitable_line IS NOT NULL AND status <> 'cancelled';

-- Conferência
SELECT to_regclass('public.bills') AS tabela,
       (SELECT COUNT(*) FROM bills) AS boletos_cadastrados;

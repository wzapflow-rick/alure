-- 026 · Lucratividade: custo de devolução cobrado pelo ML por pedido.
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_cost_seller numeric(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_synced_at   timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_error       text;

CREATE INDEX IF NOT EXISTS orders_with_mediations_idx
  ON orders(order_date)
  WHERE jsonb_typeof(raw->'mediations') = 'array' AND jsonb_array_length(raw->'mediations') > 0;

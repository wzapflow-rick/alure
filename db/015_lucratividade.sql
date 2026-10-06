-- 015 · Lucratividade: frete pago pelo vendedor por pedido + investimento diário em Ads.
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_id          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost_seller numeric(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_synced_at   timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_error       text;

UPDATE orders
   SET shipment_id = raw->'shipping'->>'id'
 WHERE shipment_id IS NULL
   AND raw->'shipping'->>'id' IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_shipping_pending_idx
  ON orders(order_date) WHERE shipment_id IS NOT NULL AND shipping_synced_at IS NULL;

CREATE TABLE IF NOT EXISTS ad_spend_daily (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marketplace_id bigint REFERENCES marketplaces(id) ON DELETE CASCADE,
  spend_date     date NOT NULL,
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),
  notes          text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_spend_daily_uidx
  ON ad_spend_daily(COALESCE(marketplace_id, 0), spend_date);

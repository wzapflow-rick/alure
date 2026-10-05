-- 011: tarifas reais do Mercado Livre por anúncio + tipo de logística (Full).
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS listing_type_id text;
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS ml_category_id  text;
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS logistic_type   text;
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS free_shipping   boolean;
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS sale_fee_pct    numeric(7,3);
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS sale_fee_fixed  numeric(12,2);
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS shipping_cost   numeric(12,2);
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS fees_price      numeric(12,2);
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS fees_synced_at  timestamptz;
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS fees_error      text;

CREATE INDEX IF NOT EXISTS product_channels_logistic_idx ON product_channels (logistic_type);

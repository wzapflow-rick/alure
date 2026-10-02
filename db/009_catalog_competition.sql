-- ALURE OS · 009 · Anúncios de catálogo e vencedor do price_to_win
-- Marca quais anúncios são de catálogo (o motor prioriza o catálogo ativo como anúncio líder do SKU)
-- e permite gravar o vencedor do catálogo em competitor_offers sem duplicar a observação do dia.
-- Idempotente: pode ser executado mais de uma vez. Requer o 007 e o 008.

ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS catalog_listing boolean NOT NULL DEFAULT false;
ALTER TABLE product_channels ADD COLUMN IF NOT EXISTS catalog_product_id text;

CREATE INDEX IF NOT EXISTS product_channels_catalog_idx
  ON product_channels(product_id, marketplace_id) WHERE catalog_listing;

-- Uma observação automática por concorrente, por anúncio, por dia e por fonte.
-- Observações manuais ficam de fora: o usuário pode registrar várias no mesmo dia.
CREATE UNIQUE INDEX IF NOT EXISTS competitor_offers_auto_daily_uidx
  ON competitor_offers(product_channel_id, lower(competitor_name), observed_on, source)
  WHERE source <> 'manual';

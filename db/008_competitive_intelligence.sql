-- ALURE OS · 008 · Inteligência competitiva
-- Observações de concorrente ganham sinais de diferenciação (Full e vendas do vendedor),
-- usados pelo motor para separar "oferta isolada" de "mercado" e sugerir diferenciação antes de preço.
-- Idempotente: pode ser executado mais de uma vez. Requer o 007.

ALTER TABLE competitor_offers ADD COLUMN IF NOT EXISTS is_full boolean;
ALTER TABLE competitor_offers ADD COLUMN IF NOT EXISTS sold_quantity integer;

ALTER TABLE competitor_offers DROP CONSTRAINT IF EXISTS competitor_offers_sold_quantity_check;
ALTER TABLE competitor_offers ADD CONSTRAINT competitor_offers_sold_quantity_check
  CHECK (sold_quantity IS NULL OR sold_quantity >= 0);

-- 016: catálogo completo + remoção do "-10%" inventado pelos seeds 010/012.
-- Idempotente: pode rodar mais de uma vez. Não apaga nenhum registro.
-- Depois desta migração, a sincronização agendada (/api/cron/sync) mantém o catálogo
-- em dia sozinha: produto ativo novo com preço ativo no marketplace entra publicado.

-- 1) Os seeds gravaram o preço do marketplace como "preço de" (riscado) e 90% dele como preço.
--    Isso não é promoção: é a regra de venda direta. Remove o preço riscado dessas linhas.
UPDATE catalog_items
   SET compare_at_price = NULL
 WHERE compare_at_price IS NOT NULL
   AND price = ROUND(compare_at_price * 0.9, 2);

-- 2) Traz todo produto ativo com preço ativo em algum marketplace que ainda não está no catálogo.
--    Compara SKU sem o prefixo KLS- e pelo vínculo product_id, então nada entra duplicado.
--    Itens que você despublicou no painel continuam despublicados.
WITH channel_price AS (
  SELECT product_id, MAX(current_price) AS price
    FROM product_channels
   WHERE status = 'active' AND current_price > 0
   GROUP BY product_id
), candidates AS (
  SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')))
         p.id, p.sku, p.name, p.category, cp.price,
         UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')) AS norm
    FROM products p
    JOIN channel_price cp ON cp.product_id = p.id
   WHERE p.active AND TRIM(p.sku) <> ''
   ORDER BY UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')), LENGTH(p.sku), p.id
)
INSERT INTO catalog_items (product_id, sku, name, category, price, compare_at_price, published, sort_order)
SELECT c.id, c.sku, c.name, c.category, ROUND(c.price * 0.9, 2), NULL, true, 10000
  FROM candidates c
 WHERE NOT EXISTS (
         SELECT 1 FROM catalog_items ci
          WHERE ci.product_id = c.id
             OR UPPER(REGEXP_REPLACE(TRIM(ci.sku), '^KLS-', '', 'i')) = c.norm
       )
ON CONFLICT (sku) DO NOTHING;

-- Conferência
SELECT published, COUNT(*) AS itens, COUNT(compare_at_price) AS com_preco_riscado
  FROM catalog_items GROUP BY published;
SELECT COUNT(*) AS produtos_ativos_com_preco
  FROM products p
 WHERE p.active AND EXISTS (
         SELECT 1 FROM product_channels pc
          WHERE pc.product_id = p.id AND pc.status = 'active' AND pc.current_price > 0);

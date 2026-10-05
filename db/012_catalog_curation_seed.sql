-- 012: popula o catálogo com a curadoria ALURE a partir da aba de produtos.
-- Idempotente: só insere SKUs que ainda não estão no catálogo (comparando sem o prefixo KLS-).
-- Preço de venda direta = 10% abaixo do maior preço ativo nos marketplaces; preço "de" = preço do marketplace.
-- Itens entram publicados e sem foto (aparecem com "Foto em breve" até você subir as imagens no painel).
WITH curation(target, sort_order) AS (
  VALUES
    ('4906.303', 10), ('4678.003', 20), ('4607.C.040', 30), ('4678.113', 40), ('SP.132.01', 50),
    ('2060.C83', 60), ('2020.C83', 70), ('4607.C.060', 80), ('4906.ACT.BR', 90), ('4124.012', 100),
    ('2240.C', 110), ('1992.GL.TET.MT', 120), ('1877.C.DSC', 130), ('1878.GL87.MT', 140),
    ('1877.GL86.MT', 150), ('4900.GL87.PQ.MT', 160), ('1785.C', 170), ('4916.C87', 180),
    ('4278.030', 190), ('1173.C', 200), ('1180.C', 210), ('4266.021', 220), ('2580.E.BR', 230),
    ('1780.C', 240), ('4278.027', 250)
), channel_price AS (
  SELECT product_id, MAX(current_price) AS price
    FROM product_channels
   WHERE status = 'active' AND current_price > 0
   GROUP BY product_id
), candidates AS (
  SELECT DISTINCT ON (c.target)
         p.id, p.sku, p.name, p.category, cp.price, c.sort_order,
         UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')) AS norm
    FROM curation c
    JOIN products p
      ON UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')) = c.target
      OR UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')) LIKE c.target || '.%'
    JOIN channel_price cp ON cp.product_id = p.id
   WHERE p.active
   ORDER BY c.target,
            (UPPER(REGEXP_REPLACE(TRIM(p.sku), '^KLS-', '', 'i')) = c.target) DESC,
            LENGTH(p.sku)
), picks AS (
  SELECT DISTINCT ON (norm) * FROM candidates ORDER BY norm, sort_order
)
INSERT INTO catalog_items (product_id, sku, name, category, price, compare_at_price, published, sort_order)
SELECT pk.id, pk.sku, pk.name, pk.category, ROUND(pk.price * 0.9, 2), pk.price, true, pk.sort_order
  FROM picks pk
 WHERE NOT EXISTS (
         SELECT 1 FROM catalog_items ci
          WHERE UPPER(REGEXP_REPLACE(TRIM(ci.sku), '^KLS-', '', 'i')) = pk.norm
       )
ON CONFLICT (sku) DO NOTHING;

-- Conferência: o que está no catálogo e quem ainda está sem foto.
SELECT sku, name, price, compare_at_price, published, cardinality(images) AS fotos
  FROM catalog_items
 ORDER BY sort_order, name;

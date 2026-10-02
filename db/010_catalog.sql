-- 010: Catálogo público de venda direta (itens editáveis + pedidos recebidos).
-- Idempotente: pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS catalog_items (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       bigint REFERENCES products(id) ON DELETE SET NULL,
  sku              text NOT NULL UNIQUE,
  name             text NOT NULL,
  description      text,
  category         text,
  finish           text,
  price            numeric(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price numeric(12,2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  images           text[] NOT NULL DEFAULT '{}',
  published        boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_items_published_idx ON catalog_items (published, sort_order, id);

CREATE TABLE IF NOT EXISTS catalog_orders (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  customer_name    text NOT NULL,
  customer_phone   text NOT NULL,
  customer_company text,
  customer_city    text,
  notes            text,
  items            jsonb NOT NULL,
  total            numeric(12,2) NOT NULL CHECK (total >= 0),
  status           text NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','em_atendimento','fechado','cancelado')),
  whatsapp_status  text NOT NULL DEFAULT 'pending'
                   CHECK (whatsapp_status IN ('pending','sent','failed')),
  whatsapp_error   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_orders_created_idx ON catalog_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_orders_phone_idx ON catalog_orders (customer_phone, created_at DESC);

-- Seleção inicial: Gatilho Ducha Final (4906.303) + 5 torneiras/misturadores acima de R$ 1.000,
-- escolhidos pelas unidades vendidas nos últimos 90 dias. Preço de venda direta = 10% abaixo
-- do maior preço ativo nos marketplaces (editável no painel). Só insere SKUs que ainda não estão no catálogo.
WITH channel_price AS (
  SELECT product_id, MAX(current_price) AS price
    FROM product_channels
   WHERE status = 'active'
   GROUP BY product_id
), sold AS (
  SELECT pc.product_id, SUM(COALESCE(NULLIF(sm.units, 0), sm.orders)) AS units
    FROM sales_metrics sm
    JOIN product_channels pc ON pc.id = sm.product_channel_id
   WHERE sm.metric_date >= CURRENT_DATE - 90
   GROUP BY pc.product_id
), shower AS (
  SELECT p.id, p.sku, p.name, p.category, cp.price, 0 AS rank
    FROM products p
    JOIN channel_price cp ON cp.product_id = p.id
   WHERE p.sku = '4906.303'
), faucets AS (
  SELECT p.id, p.sku, p.name, p.category, cp.price,
         ROW_NUMBER() OVER (ORDER BY COALESCE(s.units, 0) DESC, cp.price DESC) AS rank
    FROM products p
    JOIN channel_price cp ON cp.product_id = p.id
    LEFT JOIN sold s ON s.product_id = p.id
   WHERE p.active
     AND cp.price >= 1000
     AND (p.name ILIKE '%torneira%' OR p.name ILIKE '%misturador%'
          OR p.category ILIKE '%torneira%' OR p.category ILIKE '%misturador%')
), picks AS (
  SELECT * FROM shower
  UNION ALL
  SELECT * FROM faucets WHERE rank <= 5
)
INSERT INTO catalog_items (product_id, sku, name, category, price, compare_at_price, published, sort_order)
SELECT id, sku, name, category, ROUND(price * 0.9, 2), price, true, rank * 10
  FROM picks
ON CONFLICT (sku) DO NOTHING;

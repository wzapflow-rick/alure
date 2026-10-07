-- 017: categorias e acabamentos do catálogo gerenciáveis (renomear, excluir, restaurar).
-- Idempotente: pode rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS catalog_taxonomy (
  id           serial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('category', 'finish')),
  label        text NOT NULL CHECK (btrim(label) <> ''),
  default_slug text,
  hidden       boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_taxonomy_kind_label_uq
  ON catalog_taxonomy (kind, lower(btrim(label)));

CREATE UNIQUE INDEX IF NOT EXISTS catalog_taxonomy_kind_slug_uq
  ON catalog_taxonomy (kind, default_slug) WHERE default_slug IS NOT NULL;

-- Padrões do catálogo (o slug liga ao reconhecimento automático pelo nome).
INSERT INTO catalog_taxonomy (kind, label, default_slug, sort_order) VALUES
  ('category', 'Peças de reposição',       'reposicao',    10),
  ('category', 'Kits e conjuntos',         'kits',         20),
  ('category', 'Acabamentos de registro',  'acabamentos',  30),
  ('category', 'Registros e válvulas',     'registros',    40),
  ('category', 'Sensores e tecnologia',    'tecnologia',   50),
  ('category', 'Misturadores',             'misturadores', 60),
  ('category', 'Torneiras',                'torneiras',    70),
  ('category', 'Duchas e chuveiros',       'duchas',       80),
  ('category', 'Acessórios de banheiro',   'acessorios',   90),
  ('finish',   'Gold Matte',               'gold-matte',   10),
  ('finish',   'Black Matte',              'black-matte',  20),
  ('finish',   'Cromado',                  'cromado',      30),
  ('finish',   'Inox / Escovado',          'inox',         40),
  ('finish',   'Branco',                   'branco',       50),
  ('finish',   'Red Gold',                 'red-gold',     60)
ON CONFLICT DO NOTHING;

-- Categorias e acabamentos que você já criou nos itens.
INSERT INTO catalog_taxonomy (kind, label, sort_order)
SELECT DISTINCT ON (lower(btrim(category))) 'category', btrim(category), 1000
  FROM catalog_items
 WHERE btrim(coalesce(category, '')) <> ''
   AND lower(btrim(category)) <> 'outros produtos'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_taxonomy (kind, label, sort_order)
SELECT DISTINCT ON (lower(btrim(finish))) 'finish', btrim(finish), 1000
  FROM catalog_items
 WHERE btrim(coalesce(finish, '')) <> ''
ON CONFLICT DO NOTHING;

-- Conferência
SELECT kind, label, default_slug, hidden,
       (SELECT count(*) FROM catalog_items ci
         WHERE lower(btrim(CASE WHEN t.kind = 'category' THEN ci.category ELSE ci.finish END)) = lower(btrim(t.label))) AS itens_definidos
  FROM catalog_taxonomy t
 ORDER BY kind, sort_order, label;

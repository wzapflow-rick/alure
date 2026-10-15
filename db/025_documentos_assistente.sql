-- 025 · Documentos do assistente (catálogos, tabelas de preço, manuais)
-- O PDF fica no Blob; o texto extraído fica aqui, por página, com busca em português.

CREATE TABLE IF NOT EXISTS assistant_documents (
  id             serial PRIMARY KEY,
  title          text NOT NULL,
  file_name      text NOT NULL,
  file_pathname  text NOT NULL,
  file_bytes     bigint NOT NULL DEFAULT 0,
  pages          int NOT NULL DEFAULT 0,
  chars          int NOT NULL DEFAULT 0,
  notes          text,
  uploaded_by    text REFERENCES "user"(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_document_pages (
  document_id  int NOT NULL REFERENCES assistant_documents(id) ON DELETE CASCADE,
  page         int NOT NULL,
  content      text NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED,
  PRIMARY KEY (document_id, page)
);

CREATE INDEX IF NOT EXISTS assistant_document_pages_tsv_idx
  ON assistant_document_pages USING gin (tsv);

-- Conferência
SELECT table_name
  FROM information_schema.tables
 WHERE table_name IN ('assistant_documents', 'assistant_document_pages')
 ORDER BY table_name;

import { query } from '@/lib/db'

export type DocumentRow = {
  id: number
  title: string
  file_name: string
  file_bytes: number
  pages: number
  chars: number
  notes: string | null
  created_at: string
  user_name: string | null
}

const MAX_PAGE_CHARS = 6000

export async function listDocuments(): Promise<DocumentRow[]> {
  try {
    return await query<DocumentRow>(
      `SELECT d.id, d.title, d.file_name, d.file_bytes::int AS file_bytes, d.pages, d.chars, d.notes,
              d.created_at::text AS created_at, u.name AS user_name
         FROM assistant_documents d
         LEFT JOIN "user" u ON u.id = d.uploaded_by
        ORDER BY d.created_at DESC`,
    )
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return []
    throw error
  }
}

export async function documentsForAssistant() {
  const docs = await listDocuments()
  return docs.map((d) => ({
    id: d.id,
    titulo: d.title,
    arquivo: d.file_name,
    paginas: d.pages,
    observacao: d.notes,
    enviado_em: d.created_at.slice(0, 10),
  }))
}

export async function searchDocuments(termo: string, documentId?: number, limit = 8) {
  const rows = await query<{ document_id: number; titulo: string; pagina: number; trecho: string; rank: number }>(
    `WITH q AS (SELECT websearch_to_tsquery('portuguese', $1) AS tsq)
     SELECT p.document_id, d.title AS titulo, p.page AS pagina,
            ts_headline('portuguese', p.content, q.tsq,
                        'MaxWords=60, MinWords=20, MaxFragments=3, FragmentDelimiter=" … "') AS trecho,
            ts_rank(p.tsv, q.tsq) AS rank
       FROM assistant_document_pages p
       JOIN assistant_documents d ON d.id = p.document_id, q
      WHERE (p.tsv @@ q.tsq OR p.content ILIKE '%' || $1 || '%')
        AND ($2::int IS NULL OR p.document_id = $2)
      ORDER BY rank DESC, p.page
      LIMIT $3`,
    [termo, documentId ?? null, limit],
  )
  return rows.map(({ rank: _rank, ...r }) => r)
}

export async function readDocumentPages(documentId: number, from: number, to: number) {
  const rows = await query<{ pagina: number; conteudo: string }>(
    `SELECT page AS pagina, content AS conteudo
       FROM assistant_document_pages
      WHERE document_id = $1 AND page BETWEEN $2 AND $3
      ORDER BY page`,
    [documentId, from, to],
  )
  return rows.map((r) => ({
    pagina: r.pagina,
    conteudo: r.conteudo.length > MAX_PAGE_CHARS ? `${r.conteudo.slice(0, MAX_PAGE_CHARS)} …` : r.conteudo,
  }))
}

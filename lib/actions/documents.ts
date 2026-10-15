'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { del, get } from '@vercel/blob'
import { extractText, getDocumentProxy } from 'unpdf'
import { queryOne, withTransaction } from '@/lib/db'
import { authed, failure, formObject, type ActionState } from '@/lib/actions/shared'

const PATH = '/documentos'

const registerSchema = z.object({
  pathname: z.string().startsWith('documentos/', 'Arquivo inválido.').max(400),
  fileName: z.string().min(1).max(200),
  title: z.string().trim().min(2, 'Dê um nome ao documento.').max(160),
  notes: z.string().trim().max(500).optional(),
  bytes: z.coerce.number().int().min(0),
})

function cleanPage(text: string) {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

async function removeBlob(pathname: string) {
  try {
    await del(pathname)
  } catch (error) {
    console.error('[alure] document blob delete failed:', error)
  }
}

export async function registerDocument(input: z.input<typeof registerSchema>): Promise<ActionState> {
  let pathname: string | null = null
  try {
    const user = await authed()
    const data = registerSchema.parse(input)
    pathname = data.pathname

    const blob = await get(data.pathname, { access: 'private' })
    if (!blob || blob.statusCode !== 200) throw new Error('Não encontrei o arquivo enviado. Tente de novo.')
    const buffer = new Uint8Array(await new Response(blob.stream).arrayBuffer())

    const pdf = await getDocumentProxy(buffer)
    const { totalPages, text } = await extractText(pdf, { mergePages: false })
    const pages = text.map(cleanPage)
    const chars = pages.reduce((sum, p) => sum + p.length, 0)

    if (chars < 200) {
      await removeBlob(data.pathname)
      return {
        ok: false,
        message: 'Este PDF não tem texto selecionável (parece escaneado). Peça ao fornecedor a versão digital ou em Excel.',
      }
    }

    await withTransaction(async (client) => {
      const doc = await client.query<{ id: number }>(
        `INSERT INTO assistant_documents (title, file_name, file_pathname, file_bytes, pages, chars, notes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [data.title, data.fileName, data.pathname, data.bytes, totalPages, chars, data.notes || null, user.id],
      )
      const nums = pages.map((_, i) => i + 1).filter((_, i) => pages[i].length > 0)
      const contents = pages.filter((p) => p.length > 0)
      await client.query(
        `INSERT INTO assistant_document_pages (document_id, page, content)
         SELECT $1, t.page, t.content FROM unnest($2::int[], $3::text[]) AS t(page, content)`,
        [doc.rows[0].id, nums, contents],
      )
    })

    revalidatePath(PATH)
    return { ok: true, message: `${data.title} salvo: ${totalPages} páginas lidas.` }
  } catch (error) {
    if (pathname) await removeBlob(pathname)
    if ((error as { code?: string }).code === '42P01') {
      return { ok: false, message: 'Rode a migração db/025_documentos_assistente.sql no banco primeiro.' }
    }
    console.error('[alure] register document failed:', error)
    return failure(error)
  }
}

export async function deleteDocument(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await authed()
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(formObject(formData))
    const doc = await queryOne<{ file_pathname: string }>(
      `DELETE FROM assistant_documents WHERE id = $1 RETURNING file_pathname`,
      [id],
    )
    if (doc) await removeBlob(doc.file_pathname)
    revalidatePath(PATH)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

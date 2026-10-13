import { get } from '@vercel/blob'
import { queryOne } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Não autorizado', { status: 401 })

  const { id } = await params
  const billId = Number(id)
  if (!Number.isInteger(billId) || billId <= 0) return new Response('Não encontrado', { status: 404 })

  const bill = await queryOne<{ file_pathname: string | null; file_name: string | null }>(
    `SELECT file_pathname, file_name FROM bills WHERE id = $1`,
    [billId],
  )
  if (!bill?.file_pathname) return new Response('Arquivo não encontrado', { status: 404 })

  const blob = await get(bill.file_pathname, { access: 'private' })
  if (!blob || blob.statusCode !== 200) return new Response('Arquivo não encontrado', { status: 404 })

  const filename = encodeURIComponent(bill.file_name ?? 'boleto')
  return new Response(blob.stream, {
    headers: {
      'Content-Type': blob.blob.contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser } from '@/lib/session'

const MAX_BYTES = 100 * 1024 * 1024

function readinessError(): string | null {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return 'Armazenamento de arquivos não configurado nesta versão. Publique o projeto de novo para ativar o Blob.'
  }
  return null
}

export async function GET() {
  const configError = readinessError()
  if (configError) return Response.json({ error: configError }, { status: 503 })
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  const configError = readinessError()
  if (configError) return Response.json({ error: configError }, { status: 503 })
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getSessionUser()
        if (!user) throw new Error('Sessão expirada. Entre novamente.')
        if (!pathname.startsWith('documentos/')) throw new Error('Caminho inválido.')
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}

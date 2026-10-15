import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser } from '@/lib/session'

const MAX_BYTES = 100 * 1024 * 1024

export async function POST(request: Request) {
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

export type DocumentData = {
  name: string
  kind: 'planilha' | 'texto' | 'documento'
  text: string
  truncated: boolean
}

export const ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxBinaryBytes: 3 * 1024 * 1024,
  maxTextChars: 120_000,
}

export const BINARY_MEDIA_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export const DOCUMENT_PREFIX = 'DOCUMENTO ANEXADO'

export function documentToPrompt(doc: DocumentData) {
  const cut = doc.truncated ? ' (conteúdo cortado no limite)' : ''
  return `${DOCUMENT_PREFIX}: ${doc.name} [${doc.kind}]${cut}\n<<<\n${doc.text}\n>>>`
}

'use client'

import type { FileUIPart } from 'ai'
import { ATTACHMENT_LIMITS, BINARY_MEDIA_TYPES, type DocumentData } from './attachments'

export type Attachment =
  | { type: 'file'; name: string; size: number; part: FileUIPart }
  | { type: 'document'; name: string; size: number; data: DocumentData }

export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.tsv,.txt,.md,.json,.xlsx,.docx'

const TEXT_EXT = ['csv', 'tsv', 'txt', 'md', 'json']

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function clip(text: string) {
  const clean = text.replace(/\r\n/g, '\n').trim()
  const truncated = clean.length > ATTACHMENT_LIMITS.maxTextChars
  return { text: truncated ? clean.slice(0, ATTACHMENT_LIMITS.maxTextChars) : clean, truncated }
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function readSpreadsheet(file: File) {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  const sheets = await readXlsxFile(file)
  return sheets
    .map((s) => {
      const rows = s.data.filter((r) => r.some((c) => c !== null && c !== ''))
      return `## Aba: ${s.sheet} (${rows.length} linhas)\n${rows.map((r) => r.map(csvCell).join(';')).join('\n')}`
    })
    .join('\n\n')
}

async function readDocx(file: File) {
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

export async function readAttachment(file: File): Promise<Attachment> {
  const ext = extOf(file.name)
  const mediaType = file.type || (ext === 'pdf' ? 'application/pdf' : '')

  if ((BINARY_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    if (file.size > ATTACHMENT_LIMITS.maxBinaryBytes) {
      throw new Error(`${file.name} passa de 3 MB. Envie um arquivo menor ou exporte só as páginas necessárias.`)
    }
    return {
      type: 'file',
      name: file.name,
      size: file.size,
      part: { type: 'file', mediaType, filename: file.name, url: await toDataUrl(file) },
    }
  }

  let raw: string
  let kind: DocumentData['kind']
  if (ext === 'xlsx') {
    raw = await readSpreadsheet(file)
    kind = 'planilha'
  } else if (ext === 'docx') {
    raw = await readDocx(file)
    kind = 'documento'
  } else if (TEXT_EXT.includes(ext)) {
    raw = await file.text()
    kind = ext === 'csv' || ext === 'tsv' ? 'planilha' : 'texto'
  } else {
    throw new Error(`${file.name}: formato não suportado. Use PDF, imagem, Excel (.xlsx), Word (.docx), CSV ou TXT.`)
  }

  const { text, truncated } = clip(raw)
  if (!text) throw new Error(`${file.name} está vazio ou não tem texto legível.`)
  return { type: 'document', name: file.name, size: file.size, data: { name: file.name, kind, text, truncated } }
}

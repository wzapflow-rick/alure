'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { FileText, Upload } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@/components/ui/primitives'
import { registerDocument } from '@/lib/actions/documents'
import { cn } from '@/lib/utils'

const MAX_BYTES = 100 * 1024 * 1024

type Phase = 'idle' | 'uploading' | 'reading'

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export function DocumentUploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null)

  function pick(next: File | undefined) {
    setResult(null)
    if (!next) return
    if (next.type !== 'application/pdf') return setResult({ ok: false, message: 'Envie um arquivo PDF.' })
    if (next.size > MAX_BYTES) return setResult({ ok: false, message: 'O limite é 100 MB por arquivo.' })
    setFile(next)
    if (!title) setTitle(next.name.replace(/\.pdf$/i, ''))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || phase !== 'idle') return
    setResult(null)
    setPhase('uploading')
    setProgress(0)
    try {
      const safeName = file.name.normalize('NFD').replace(/[^\w.-]+/g, '-').toLowerCase()
      const blob = await upload(`documentos/${safeName}`, file, {
        access: 'private',
        handleUploadUrl: '/api/documentos/upload',
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      })
      setPhase('reading')
      const res = await registerDocument({
        pathname: blob.pathname,
        fileName: file.name,
        title,
        notes,
        bytes: file.size,
      })
      setResult(res)
      if (res?.ok) {
        setFile(null)
        setTitle('')
        setNotes('')
        if (inputRef.current) inputRef.current.value = ''
        router.refresh()
      }
    } catch (error) {
      setResult({ ok: false, message: (error as Error).message || 'Falha no envio. Tente de novo.' })
    } finally {
      setPhase('idle')
    }
  }

  const busy = phase !== 'idle'

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label
        className={cn(
          'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-muted/50',
          busy && 'pointer-events-none opacity-60',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pick(e.dataTransfer.files[0])
        }}
      >
        {file ? (
          <>
            <FileText className="size-6 text-primary" aria-hidden />
            <span className="text-sm font-medium break-all">{file.name}</span>
            <span className="text-xs text-muted-foreground">{formatMb(file.size)} · toque para trocar</span>
          </>
        ) : (
          <>
            <Upload className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Escolha ou arraste um PDF</span>
            <span className="text-xs text-muted-foreground">Até 100 MB · catálogos, tabelas de preço, manuais</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      <Field label="Nome do documento" htmlFor="doc-title">
        <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Catálogo Deca · Peças de reposição" required maxLength={160} />
      </Field>
      <Field label="Observação (opcional)" hint="Ex.: fornecedor, validade, o que o assistente deve procurar." htmlFor="doc-notes">
        <Textarea id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
      </Field>

      {busy ? (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: phase === 'reading' ? '100%' : `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {phase === 'uploading' ? `Enviando… ${progress}%` : 'Lendo as páginas do PDF…'}
          </span>
        </div>
      ) : null}

      {result ? (
        <p role="status" className={cn('text-sm', result.ok ? 'text-positive' : 'text-critical')}>
          {result.message}
        </p>
      ) : null}

      <Button type="submit" disabled={!file || !title.trim() || busy} className="self-start">
        {busy ? 'Processando…' : 'Salvar na memória'}
      </Button>
    </form>
  )
}

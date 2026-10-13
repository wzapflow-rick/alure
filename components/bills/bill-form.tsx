'use client'

import { useActionState, useMemo, useRef, useState, useTransition } from 'react'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { SubmitButton } from '@/components/forms/action-form'
import { extractBillFile, saveBill, type AttachedFile, type BillDraft } from '@/lib/actions/bills'
import { BILL_CATEGORIES, moneyToInput } from '@/lib/bills/constants'
import { formatDigitableLine, onlyDigits, parseBoleto } from '@/lib/bills/barcode'
import { cn } from '@/lib/utils'

export type BillFormValues = BillDraft & { notes: string }

const EMPTY: BillFormValues = {
  beneficiary: '',
  description: '',
  category: 'fornecedor',
  amount: '',
  due_date: '',
  digitable_line: '',
  document_number: '',
  installment_number: '',
  installment_total: '',
  notes: '',
}

function formatMoneyBR(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BillForm({
  id,
  initial,
  initialFile,
  today,
}: {
  id?: number
  initial?: Partial<BillFormValues>
  initialFile?: AttachedFile | null
  today: string
}) {
  const isEdit = Boolean(id)
  const [values, setValues] = useState<BillFormValues>({ ...EMPTY, ...initial })
  const [file, setFile] = useState<AttachedFile | null>(initialFile ?? null)
  const [generate, setGenerate] = useState(true)
  const [readMessage, setReadMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [reading, startReading] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const [state, formAction] = useActionState(async (prev: Awaited<ReturnType<typeof saveBill>>, formData: FormData) => {
    const result = await saveBill(prev, formData)
    if (result?.ok && !isEdit) {
      setValues(EMPTY)
      setFile(null)
      setReadMessage(null)
    }
    return result
  }, null)

  const parsed = useMemo(() => (values.digitable_line ? parseBoleto(values.digitable_line, today) : null), [values.digitable_line, today])
  const lineDigits = onlyDigits(values.digitable_line)

  function set<K extends keyof BillFormValues>(key: K, value: BillFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function onLineChange(raw: string) {
    const result = parseBoleto(raw, today)
    setValues((current) => ({
      ...current,
      digitable_line: raw,
      ...(result?.valid && result.amount !== null ? { amount: moneyToInput(result.amount) } : {}),
      ...(result?.valid && result.dueDate ? { due_date: result.dueDate } : {}),
    }))
  }

  function onFileSelected(selected: File | undefined) {
    if (!selected) return
    const data = new FormData()
    data.append('file', selected)
    setReadMessage(null)
    startReading(async () => {
      const result = await extractBillFile(data)
      if (result.file) setFile(result.file)
      if (result.draft) setValues((current) => ({ ...current, ...result.draft }))
      setReadMessage(result.message ? { ok: result.ok, text: result.message } : null)
      if (fileInput.current) fileInput.current.value = ''
    })
  }

  const installmentNumber = Number(values.installment_number)
  const installmentTotal = Number(values.installment_total)
  const canGenerate = !isEdit && installmentNumber > 0 && installmentTotal > installmentNumber

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="file_pathname" value={file?.pathname ?? ''} />
      <input type="hidden" name="file_name" value={file?.name ?? ''} />
      <input type="hidden" name="file_type" value={file?.type ?? ''} />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Arquivo do boleto</span>
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5">
            <FileText className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Remover anexo">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/50',
              reading && 'pointer-events-none opacity-70',
            )}
          >
            {reading ? <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> : <Paperclip className="size-5 text-muted-foreground" aria-hidden />}
            <span className="text-sm font-medium">{reading ? 'Lendo o boleto…' : 'Enviar PDF ou foto do boleto'}</span>
            <span className="text-xs text-muted-foreground">O sistema preenche credor, valor e vencimento para você conferir.</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={reading}
              onChange={(e) => onFileSelected(e.target.files?.[0])}
            />
          </label>
        )}
        {readMessage ? (
          <p role="status" className={cn('text-xs', readMessage.ok ? 'text-positive' : 'text-attention')}>
            {readMessage.text}
          </p>
        ) : null}
      </div>

      <Field
        label="Linha digitável ou código de barras"
        htmlFor={`line-${id ?? 'new'}`}
        hint={parsed ? undefined : 'Cole os números: o valor e o vencimento são lidos automaticamente.'}
      >
        <Input
          id={`line-${id ?? 'new'}`}
          name="digitable_line"
          inputMode="numeric"
          autoComplete="off"
          className="font-mono text-[13px]"
          value={values.digitable_line}
          onChange={(e) => onLineChange(e.target.value)}
          placeholder="00190.00009 01234.567890 12345.678901 2 10000000012345"
        />
      </Field>
      {parsed ? (
        <p className={cn('-mt-2 text-xs', parsed.valid ? 'text-positive' : 'text-critical')} role="status">
          {parsed.valid
            ? [
                parsed.kind === 'bancario' ? `Boleto bancário · banco ${parsed.bankCode}` : 'Conta de consumo / tributo',
                parsed.amount !== null ? formatMoneyBR(parsed.amount) : null,
                parsed.dueDate ? `vence ${parsed.dueDate.split('-').reverse().join('/')}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Algum número parece errado: confira a linha digitável.'}
        </p>
      ) : lineDigits.length > 0 && lineDigits.length < 44 ? (
        <p className="-mt-2 text-xs text-muted-foreground">{lineDigits.length} de 47 números</p>
      ) : null}
      {parsed?.valid && lineDigits.length !== 44 ? (
        <p className="sr-only">{formatDigitableLine(lineDigits)}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Credor (quem recebe)" htmlFor={`ben-${id ?? 'new'}`}>
          <Input id={`ben-${id ?? 'new'}`} name="beneficiary" required maxLength={200} value={values.beneficiary} onChange={(e) => set('beneficiary', e.target.value)} />
        </Field>
        <Field label="Categoria" htmlFor={`cat-${id ?? 'new'}`}>
          <Select id={`cat-${id ?? 'new'}`} name="category" value={values.category} onChange={(e) => set('category', e.target.value)}>
            {BILL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor (R$)" htmlFor={`amt-${id ?? 'new'}`}>
          <Input
            id={`amt-${id ?? 'new'}`}
            name="amount"
            required
            inputMode="decimal"
            className="tabular"
            placeholder="0,00"
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </Field>
        <Field label="Vencimento" htmlFor={`due-${id ?? 'new'}`}>
          <Input id={`due-${id ?? 'new'}`} name="due_date" type="date" required value={values.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
      </div>

      <Field label="Descrição" htmlFor={`desc-${id ?? 'new'}`}>
        <Input
          id={`desc-${id ?? 'new'}`}
          name="description"
          maxLength={300}
          placeholder="Ex.: Compra de embalagens de outubro"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Nº do documento" htmlFor={`doc-${id ?? 'new'}`}>
          <Input id={`doc-${id ?? 'new'}`} name="document_number" maxLength={80} value={values.document_number} onChange={(e) => set('document_number', e.target.value)} />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Parcela</legend>
          <div className="flex items-center gap-2">
            <Input
              name="installment_number"
              inputMode="numeric"
              aria-label="Número da parcela"
              className="w-16 text-center tabular"
              value={values.installment_number}
              onChange={(e) => set('installment_number', onlyDigits(e.target.value).slice(0, 3))}
            />
            <span className="text-sm text-muted-foreground">de</span>
            <Input
              name="installment_total"
              inputMode="numeric"
              aria-label="Total de parcelas"
              className="w-16 text-center tabular"
              value={values.installment_total}
              onChange={(e) => set('installment_total', onlyDigits(e.target.value).slice(0, 3))}
            />
          </div>
        </fieldset>
      </div>

      {canGenerate ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            name="generate_installments"
            checked={generate}
            onChange={(e) => setGenerate(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            Lançar as próximas {installmentTotal - installmentNumber} parcelas
            <span className="block text-xs text-muted-foreground">Uma por mês, com o mesmo valor. Assim a dívida inteira aparece no planejamento.</span>
          </span>
        </label>
      ) : null}

      <Field label="Observações" htmlFor={`notes-${id ?? 'new'}`}>
        <Textarea id={`notes-${id ?? 'new'}`} name="notes" rows={2} maxLength={2000} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={reading}>{isEdit ? 'Salvar alterações' : 'Salvar boleto'}</SubmitButton>
        {state?.message ? (
          <p role="status" className={cn('text-sm', state.ok ? 'text-positive' : 'text-critical')}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}

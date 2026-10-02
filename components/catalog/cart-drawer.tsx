'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Trash2, X } from 'lucide-react'
import { useCart } from '@/components/catalog/cart-provider'
import { QuantityStepper } from '@/components/catalog/quantity-stepper'
import { submitCatalogOrder } from '@/lib/actions/catalog-order'
import { formatBRL } from '@/lib/format'

type Step = 'cart' | 'checkout' | 'done'

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-info/25'

export function CartDrawer() {
  const { lines, count, total, open, setOpen, setQty, remove, clear } = useCart()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<Step>('cart')
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleClose() {
    setOpen(false)
    if (step === 'done') setStep('cart')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await submitCatalogOrder({
        name: String(data.get('name') ?? ''),
        phone: String(data.get('phone') ?? ''),
        company: String(data.get('company') ?? ''),
        city: String(data.get('city') ?? ''),
        notes: String(data.get('notes') ?? ''),
        website: String(data.get('website') ?? ''),
        items: lines.map((l) => ({ id: l.id, qty: l.qty })),
      })
      if (result.ok) {
        setCode(result.code)
        clear()
        setStep('done')
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
      aria-label="Seu pedido"
      className="catalog-theme fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md bg-background p-0 text-foreground backdrop:bg-[#0d1821]/45 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {step === 'checkout' ? (
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="inline-flex size-8 items-center justify-center rounded-full hover:bg-surface-2"
                aria-label="Voltar para o pedido"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : null}
            <h2 className="text-base font-semibold">
              {step === 'checkout' ? 'Seus dados' : step === 'done' ? 'Pedido enviado' : 'Seu pedido'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {step === 'done' ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6">
            <CheckCircle2 className="size-10 text-positive" aria-hidden />
            <p className="text-2xl font-semibold tracking-tight text-balance">Recebemos seu pedido.</p>
            <p className="font-mono text-sm text-muted-foreground">{code}</p>
            <p className="max-w-sm leading-relaxed text-muted-foreground text-pretty">
              Nossa equipe vai confirmar disponibilidade, frete e prazo com você pelo WhatsApp em breve.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Continuar vendo o catálogo
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-medium">Seu pedido está vazio.</p>
            <p className="text-sm text-muted-foreground">Escolha os produtos e as quantidades no catálogo.</p>
          </div>
        ) : step === 'cart' ? (
          <>
            <ul className="flex flex-1 flex-col divide-y divide-border overflow-y-auto px-5">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-4 py-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface">
                    {line.image ? (
                      <Image src={line.image} alt="" fill sizes="80px" className="object-contain p-2" />
                    ) : (
                      <span className="flex size-full items-center justify-center font-mono text-[10px] text-muted-foreground">
                        {line.sku}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug text-pretty">{line.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.id)}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-critical"
                        aria-label={`Remover ${line.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <QuantityStepper value={line.qty} onChange={(q) => setQty(line.id, q)} label={`Quantidade de ${line.name}`} size="sm" />
                      <span className="tabular text-sm font-semibold">{formatBRL(line.price * line.qty)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="flex flex-col gap-3 border-t border-border px-5 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  {count} {count === 1 ? 'unidade' : 'unidades'}
                </span>
                <span className="tabular text-xl font-semibold">{formatBRL(total)}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Frete e prazo são combinados pelo WhatsApp.</p>
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="h-12 rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Continuar
              </button>
            </footer>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex flex-1 flex-col gap-4 px-5 py-5">
              <Field label="Nome" htmlFor="co-name" required>
                <input id="co-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
              </Field>
              <Field label="WhatsApp" htmlFor="co-phone" required>
                <input
                  id="co-phone"
                  name="phone"
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  className={inputClass}
                />
              </Field>
              <Field label="Empresa ou escritório" htmlFor="co-company">
                <input id="co-company" name="company" maxLength={120} autoComplete="organization" className={inputClass} />
              </Field>
              <Field label="Cidade / UF" htmlFor="co-city">
                <input id="co-city" name="city" maxLength={120} autoComplete="address-level2" className={inputClass} />
              </Field>
              <Field label="Observações" htmlFor="co-notes">
                <textarea
                  id="co-notes"
                  name="notes"
                  maxLength={1000}
                  rows={3}
                  placeholder="Obra, prazo desejado, acabamento..."
                  className={`${inputClass} h-auto py-3 leading-relaxed`}
                />
              </Field>
              <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
                <label htmlFor="co-website">Site</label>
                <input id="co-website" name="website" tabIndex={-1} autoComplete="off" />
              </div>
            </div>
            <footer className="flex flex-col gap-3 border-t border-border px-5 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total do pedido</span>
                <span className="tabular text-xl font-semibold">{formatBRL(total)}</span>
              </div>
              {error ? (
                <p role="alert" className="text-sm text-critical">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Enviar pedido
              </button>
            </footer>
          </form>
        )}
      </div>
    </dialog>
  )
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? <span className="text-muted-foreground"> *</span> : null}
      </label>
      {children}
    </div>
  )
}

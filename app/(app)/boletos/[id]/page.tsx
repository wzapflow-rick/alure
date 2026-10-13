import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badges'
import { Disclosure, Field, Input, PageHeader, Panel, Stat } from '@/components/ui/primitives'
import { ActionForm, InlineAction, SubmitButton } from '@/components/forms/action-form'
import { BillForm } from '@/components/bills/bill-form'
import { CopyLine } from '@/components/bills/copy-line'
import { cancelBill, deleteBill, payBill, reopenBill } from '@/lib/actions/bills'
import { CATEGORY_LABEL, billState, moneyToInput } from '@/lib/bills/constants'
import { formatDigitableLine } from '@/lib/bills/barcode'
import { getBill, isBillsTableReady, listGroupBills } from '@/lib/bills/queries'
import { formatBRL, formatDate, todayISO } from '@/lib/format'
import { buttonVariants } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'Boleto' }

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const billId = Number(id)
  if (!Number.isInteger(billId) || billId <= 0 || !(await isBillsTableReady())) notFound()
  const bill = await getBill(billId)
  if (!bill) notFound()

  const today = todayISO()
  const state = billState(bill, today)
  const group = bill.group_id ? await listGroupBills(bill.group_id) : []

  return (
    <div className="flex flex-col gap-6">
      <Link href="/boletos" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Boletos
      </Link>

      <PageHeader
        eyebrow={CATEGORY_LABEL[bill.category] ?? 'Boleto'}
        title={bill.beneficiary}
        description={bill.description ?? undefined}
        action={<Badge tone={state.tone}>{state.label}</Badge>}
      />

      <Panel>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-4 py-5 sm:px-5 lg:grid-cols-4">
          <Stat label="Valor" value={formatBRL(bill.amount)} size="lg" />
          <Stat label="Vencimento" value={formatDate(bill.due_date)} tone={state.tone === 'critical' ? 'critical' : undefined} />
          <Stat
            label="Parcela"
            value={bill.installment_number ? `${bill.installment_number}${bill.installment_total ? ` de ${bill.installment_total}` : ''}` : 'Única'}
          />
          <Stat
            label={bill.status === 'paid' ? 'Pago' : 'Situação'}
            value={bill.status === 'paid' ? formatBRL(bill.paid_amount ?? bill.amount) : bill.status === 'cancelled' ? 'Cancelado' : 'Em aberto'}
            hint={bill.status === 'paid' && bill.paid_at ? `em ${formatDate(bill.paid_at)}` : undefined}
            tone={bill.status === 'paid' ? 'positive' : undefined}
          />
        </div>
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Dados do boleto">
          <div className="px-4 py-5 sm:px-5">
            <BillForm
              id={bill.id}
              today={today}
              initial={{
                beneficiary: bill.beneficiary,
                description: bill.description ?? '',
                category: bill.category,
                amount: moneyToInput(bill.amount),
                due_date: bill.due_date,
                digitable_line: bill.digitable_line ? formatDigitableLine(bill.digitable_line) : '',
                document_number: bill.document_number ?? '',
                installment_number: bill.installment_number ? String(bill.installment_number) : '',
                installment_total: bill.installment_total ? String(bill.installment_total) : '',
                notes: bill.notes ?? '',
              }}
              initialFile={bill.file_pathname ? { pathname: bill.file_pathname, name: bill.file_name ?? 'boleto', type: bill.file_type ?? '' } : null}
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Pagamento">
            <div className="px-4 py-5 sm:px-5">
              {bill.status === 'open' ? (
                <ActionForm action={payBill}>
                  <input type="hidden" name="id" value={bill.id} />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Pago em" htmlFor="paid_at">
                      <Input id="paid_at" name="paid_at" type="date" required defaultValue={today} />
                    </Field>
                    <Field label="Valor pago (R$)" htmlFor="paid_amount" hint="Com juros ou desconto, se houver.">
                      <Input id="paid_amount" name="paid_amount" inputMode="decimal" className="tabular" defaultValue={moneyToInput(bill.amount)} />
                    </Field>
                  </div>
                  <Field label="Como foi pago" htmlFor="payment_note">
                    <Input id="payment_note" name="payment_note" maxLength={300} placeholder="Ex.: PIX conta Inter" />
                  </Field>
                  <SubmitButton>Marcar como pago</SubmitButton>
                </ActionForm>
              ) : (
                <div className="flex flex-col gap-3">
                  {bill.status === 'paid' ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Pago em {formatDate(bill.paid_at)} · {formatBRL(bill.paid_amount ?? bill.amount)}
                      {bill.payment_note ? ` · ${bill.payment_note}` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Este boleto foi cancelado e não entra nas contas a pagar.</p>
                  )}
                  <InlineAction action={reopenBill} fields={{ id: bill.id }} label="Voltar para em aberto" variant="secondary" />
                </div>
              )}
            </div>
          </Panel>

          {bill.digitable_line || bill.file_pathname ? (
            <Panel title="Para pagar">
              <div className="flex flex-col gap-3 px-4 py-5 sm:px-5">
                {bill.digitable_line ? (
                  <>
                    <p className="break-all font-mono text-[13px] leading-relaxed">{formatDigitableLine(bill.digitable_line)}</p>
                    <CopyLine value={bill.digitable_line} />
                  </>
                ) : null}
                {bill.file_pathname ? (
                  <a
                    href={`/api/boletos/${bill.id}/arquivo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'w-fit' })}
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    Abrir arquivo
                  </a>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {group.length > 1 ? (
            <Panel title="Parcelas desta dívida">
              <ul className="divide-y divide-border">
                {group.map((g) => {
                  const s = billState(g, today)
                  return (
                    <li key={g.id}>
                      <Link
                        href={`/boletos/${g.id}`}
                        aria-current={g.id === bill.id ? 'page' : undefined}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 aria-[current=page]:bg-primary/5 sm:px-5"
                      >
                        <span className="tabular">
                          {g.installment_number}/{g.installment_total} · {formatDate(g.due_date)}
                        </span>
                        <Badge tone={s.tone}>{g.status === 'open' ? formatBRL(g.amount) : s.label}</Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ) : null}

          <Disclosure summary="Cancelar ou excluir">
            <div className="flex flex-col gap-3">
              {bill.status === 'open' ? (
                <div className="flex flex-col gap-1.5">
                  <InlineAction action={cancelBill} fields={{ id: bill.id }} label="Cancelar boleto" variant="secondary" />
                  <p className="text-xs text-muted-foreground">Use quando a cobrança foi substituída ou negociada. Fica no histórico.</p>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <InlineAction action={deleteBill} fields={{ id: bill.id }} label="Excluir de vez" variant="danger" />
                <p className="text-xs text-muted-foreground">Apaga o boleto e o arquivo. Não dá para desfazer.</p>
              </div>
            </div>
          </Disclosure>
        </div>
      </div>
    </div>
  )
}

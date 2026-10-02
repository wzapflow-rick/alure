'use client'

import { useActionState } from 'react'
import { Select } from '@/components/ui/primitives'
import { updateCatalogOrderStatus } from '@/lib/actions/catalog'
import type { OrderStatus } from '@/lib/catalog/types'

const LABEL: Record<OrderStatus, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  fechado: 'Fechado',
  cancelado: 'Cancelado',
}

export function OrderStatusForm({ id, status }: { id: number; status: OrderStatus }) {
  const [, formAction, pending] = useActionState(updateCatalogOrderStatus, null)
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Select
        name="status"
        defaultValue={status}
        disabled={pending}
        aria-label="Status do pedido"
        className="h-8 w-auto"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {Object.entries(LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
    </form>
  )
}

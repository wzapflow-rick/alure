'use client'

import { Button } from '@/components/ui/primitives'

function setAll(button: HTMLButtonElement, mode: 'all' | 'none' | 'whatsapp') {
  const form = button.closest('form')
  form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]').forEach((box) => {
    box.checked = mode === 'all' || (mode === 'whatsapp' && box.dataset.whatsapp === 'true')
  })
}

export function SelectAll() {
  return (
    <div className="flex flex-wrap gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={(e) => setAll(e.currentTarget, 'whatsapp')}>
        Só com WhatsApp
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={(e) => setAll(e.currentTarget, 'all')}>
        Marcar todos
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={(e) => setAll(e.currentTarget, 'none')}>
        Limpar
      </Button>
    </div>
  )
}

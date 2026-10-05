import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader, Panel, buttonVariants } from '@/components/ui/primitives'
import { CostImportForm } from '@/components/products/cost-import-form'

export const metadata: Metadata = { title: 'Importar custos' }

export default function ImportCostsPage() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  return (
    <>
      <PageHeader
        title="Importar custos"
        description="Cadastre o custo de vários produtos de uma vez colando as linhas da sua planilha."
        action={
          <Link href="/produtos" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Voltar para Produtos
          </Link>
        }
      />
      <Panel>
        <CostImportForm today={today} />
      </Panel>
    </>
  )
}

import type { Metadata } from 'next'
import { Panel } from '@/components/ui/primitives'
import { CampaignForm } from '@/components/broadcast/campaign-form'
import { listTags } from '@/lib/broadcast/queries'

export const metadata: Metadata = { title: 'Nova campanha · Disparos' }

export default async function NewCampaignPage() {
  const tags = await listTags()
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const link = host ? `https://${host}/catalogo?utm_source=whatsapp&utm_medium=disparo` : ''
  return (
    <Panel title="Nova campanha">
      <div className="p-5">
        <CampaignForm defaultLink={link} tags={tags} />
      </div>
    </Panel>
  )
}

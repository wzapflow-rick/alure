import type { Metadata } from 'next'
import { Panel } from '@/components/ui/primitives'
import { CampaignForm } from '@/components/broadcast/campaign-form'
import { listTags, listVarKeys } from '@/lib/broadcast/queries'
import { listInstances } from '@/lib/dsp/instances'
import { requireDspUser } from '@/lib/dsp/session'

export const metadata: Metadata = { title: 'Nova campanha · Disparos' }

export default async function NewCampaignPage() {
  const user = await requireDspUser()
  const [tags, varKeys, instances] = await Promise.all([listTags(user.companyId), listVarKeys(user.companyId), listInstances(user.companyId)])
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const link = host && user.companyId === '1' ? `https://${host}/catalogo?utm_source=whatsapp&utm_medium=disparo` : ''
  return (
    <Panel title="Nova campanha">
      <div className="p-5">
        <CampaignForm defaultLink={link} tags={tags} varKeys={varKeys} instances={instances.map((i) => ({ id: i.id, label: i.label }))} />
      </div>
    </Panel>
  )
}

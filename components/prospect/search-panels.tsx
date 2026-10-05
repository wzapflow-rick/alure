import { Field, Input, Panel, Select } from '@/components/ui/primitives'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { runProspectSearch, saveProspectSettings, verifyProspectsNow } from '@/lib/actions/prospect'
import type { ProspectSettings } from '@/lib/prospect/queries'
import { MAX_PAGES } from '@/lib/prospect/serpapi'

export function SearchPanel({ configured }: { configured: boolean }) {
  return (
    <Panel title="Nova busca no Google Maps">
      <ActionForm action={runProspectSearch} className="gap-4 p-5">
        {!configured ? (
          <p className="text-sm text-attention">
            SERPAPI_API_KEY ainda não está nas variáveis do projeto de hospedagem. As buscas vão falhar até ela ser criada.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_8rem]">
          <Field label="O que buscar" htmlFor="query" hint="Use o termo que você digitaria no Maps.">
            <Input id="query" name="query" required maxLength={120} placeholder="loja de móveis planejados" />
          </Field>
          <Field label="Onde" htmlFor="location" hint="Cidade, bairro ou região.">
            <Input id="location" name="location" maxLength={120} placeholder="Campinas, SP" />
          </Field>
          <Field label="Páginas" htmlFor="pages" hint="20 por página.">
            <Select id="pages" name="pages" defaultValue="2">
              {Array.from({ length: MAX_PAGES }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} · até {(i + 1) * 20}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Cada página consome 1 crédito da SerpAPI. Lugares já buscados são atualizados, não duplicados.</p>
        <SubmitButton className="self-start">Buscar contatos</SubmitButton>
      </ActionForm>
    </Panel>
  )
}

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 accent-primary" />
      <span>
        {label}
        <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

export function VerificationPanel({
  settings,
  checkedToday,
  pending,
  searchId,
  evolutionReady,
}: {
  settings: ProspectSettings
  checkedToday: number
  pending: number
  searchId: string | null
  evolutionReady: boolean
}) {
  const active = settings.wa_check_enabled || settings.site_scan_enabled
  return (
    <Panel
      title="Verificação de WhatsApp"
      action={
        <span className={active ? 'text-xs text-positive' : 'text-xs text-muted-foreground'}>
          {active ? 'Ligada' : 'Desligada'} · {checkedToday}/{settings.daily_check_cap} hoje
        </span>
      }
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto]">
        <ActionForm action={saveProspectSettings} className="gap-3">
          <Toggle
            name="wa_check_enabled"
            label="Checar número no WhatsApp"
            hint="Pergunta à Evolution se o número tem conta, sem mandar mensagem. Inclui fixos com WhatsApp Business."
            defaultChecked={settings.wa_check_enabled}
          />
          <Toggle
            name="site_scan_enabled"
            label="Procurar WhatsApp no site"
            hint="Lê a página inicial atrás de links wa.me. Quando acha, usa esse número no lugar do telefone do Maps."
            defaultChecked={settings.site_scan_enabled}
          />
          <Toggle
            name="auto_check"
            label="Verificar automaticamente após cada busca"
            hint="Sem isso, use o botão “Verificar agora”."
            defaultChecked={settings.auto_check}
          />
          <Toggle
            name="require_whatsapp"
            label="Só enviar para Disparos quem tem WhatsApp confirmado"
            hint="Recomendado: número inexistente aumenta a taxa de erro e pode pausar a campanha."
            defaultChecked={settings.require_whatsapp}
          />
          <Field label="Limite de verificações por dia" htmlFor="daily_check_cap" className="max-w-56">
            <Input id="daily_check_cap" name="daily_check_cap" type="number" min={20} max={2000} defaultValue={settings.daily_check_cap} />
          </Field>
          <SubmitButton variant="secondary" size="sm" className="self-start">
            Salvar
          </SubmitButton>
        </ActionForm>

        <ActionForm action={verifyProspectsNow} className="gap-2 lg:w-64">
          {searchId ? <input type="hidden" name="search_id" value={searchId} /> : null}
          <p className="text-sm">
            <span className="font-semibold tabular">{pending}</span>{' '}
            <span className="text-muted-foreground">{searchId ? 'a verificar nesta busca' : 'a verificar no total'}</span>
          </p>
          {!evolutionReady && settings.wa_check_enabled ? (
            <p className="text-xs text-attention">Evolution API não configurada.</p>
          ) : null}
          <SubmitButton className="self-start">Verificar agora</SubmitButton>
          <p className="text-xs leading-relaxed text-muted-foreground">Até 200 por clique, em lotes com pausa, usando a mesma instância dos disparos.</p>
        </ActionForm>
      </div>
    </Panel>
  )
}

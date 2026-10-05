import { Disclosure, Field, Input, Panel, Select } from '@/components/ui/primitives'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { runProspectSearch, saveProspectSettings, verifyProspectsNow } from '@/lib/actions/prospect'
import type { ProspectSettings } from '@/lib/prospect/queries'
import { MAX_PAGES } from '@/lib/prospect/serpapi'
import { cn } from '@/lib/utils'

export function SearchPanel({ configured }: { configured: boolean }) {
  return (
    <Panel title="Buscar no Google Maps">
      <ActionForm action={runProspectSearch} className="gap-4 p-4 sm:p-5">
        {!configured ? (
          <p className="text-sm text-attention">Falta a variável SERPAPI_API_KEY no projeto de hospedagem. As buscas vão falhar até ela existir.</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[1fr_1fr_9rem_auto] md:items-end">
          <Field label="O que buscar" htmlFor="query">
            <Input id="query" name="query" required maxLength={120} placeholder="loja de móveis planejados" />
          </Field>
          <Field label="Onde" htmlFor="location">
            <Input id="location" name="location" maxLength={120} placeholder="Campinas, SP" />
          </Field>
          <Field label="Quantidade" htmlFor="pages">
            <Select id="pages" name="pages" defaultValue="2">
              {Array.from({ length: MAX_PAGES }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  até {(i + 1) * 20}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton className="w-full md:w-auto">Buscar</SubmitButton>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Cada 20 resultados consomem 1 crédito da SerpAPI. Lugares repetidos são atualizados, não duplicados.
        </p>
      </ActionForm>
    </Panel>
  )
}

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 accent-primary" />
      <span className="flex flex-col gap-0.5">
        {label}
        <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
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
  const methods = [settings.wa_check_enabled && 'número', settings.site_scan_enabled && 'site'].filter(Boolean).join(' + ')

  return (
    <Panel>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className={cn('size-2 rounded-full', active ? 'bg-positive' : 'bg-muted-foreground/40')} />
            Verificação de WhatsApp {active ? `ligada · ${methods}` : 'desligada'}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {pending} {searchId ? 'a verificar nesta busca' : 'a verificar'} · {checkedToday}/{settings.daily_check_cap} usadas hoje
            {settings.auto_check ? ' · automática após buscar' : ''}
          </p>
          {!evolutionReady && settings.wa_check_enabled ? <p className="text-xs text-attention">Evolution API não configurada.</p> : null}
        </div>
        <ActionForm action={verifyProspectsNow} className="shrink-0">
          {searchId ? <input type="hidden" name="search_id" value={searchId} /> : null}
          <SubmitButton variant={pending ? 'primary' : 'secondary'} disabled={!active || !pending} className="w-full sm:w-auto">
            Verificar agora
          </SubmitButton>
        </ActionForm>
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-5">
        <Disclosure summary="Ajustes da verificação">
          <ActionForm action={saveProspectSettings} className="gap-4 pb-2">
            <div className="grid gap-4 md:grid-cols-2">
              <Toggle
                name="wa_check_enabled"
                label="Checar número no WhatsApp"
                hint="Consulta a Evolution sem enviar mensagem. Inclui fixos com WhatsApp Business."
                defaultChecked={settings.wa_check_enabled}
              />
              <Toggle
                name="site_scan_enabled"
                label="Procurar WhatsApp no site"
                hint="Lê links wa.me da página inicial e usa esse número no lugar do telefone do Maps."
                defaultChecked={settings.site_scan_enabled}
              />
              <Toggle
                name="auto_check"
                label="Verificar automaticamente após cada busca"
                hint="Desligado, a verificação só roda pelo botão."
                defaultChecked={settings.auto_check}
              />
              <Toggle
                name="require_whatsapp"
                label="Enviar para Disparos só quem tem WhatsApp"
                hint="Recomendado: números inválidos aumentam a taxa de erro e pausam a campanha."
                defaultChecked={settings.require_whatsapp}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Limite diário de verificações" htmlFor="daily_check_cap" className="sm:w-56">
                <Input id="daily_check_cap" name="daily_check_cap" type="number" min={20} max={2000} defaultValue={settings.daily_check_cap} />
              </Field>
              <SubmitButton variant="secondary">Salvar ajustes</SubmitButton>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Até 200 por clique, em lotes com pausa, pela mesma instância dos disparos.
            </p>
          </ActionForm>
        </Disclosure>
      </div>
    </Panel>
  )
}

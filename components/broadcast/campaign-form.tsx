'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { createCampaign } from '@/lib/actions/broadcast'
import { PLACEHOLDERS, countCombinations, renderMessage } from '@/lib/broadcast/text'

const STARTERS = [
  '{saudacao}, {primeiro_nome}! {Tudo bem?|Tudo certo por aí?|Como vai?}\n\n{Aqui é da|Falo da} {empresa}. {Preparamos|Separamos} {uma novidade|uma condição especial} {pra você|para os nossos contatos}.\n\n{Dá uma olhada|Confere aqui}: {link}',
  '{Oi|Olá|Opa}, {primeiro_nome}, {tudo bem|tudo certo}? {Sou|Falo} da {empresa}.\n\n{Queria te mostrar|Passando para te mostrar} {o que temos de novo|nossas novidades}: {link}',
  '{saudacao}! {Lembrei de você|Passando rapidinho}: {temos|estamos com} {novidades|condições especiais} na {empresa}.\n\n{Se precisar de algo|Caso tenha interesse}, {é só responder aqui|me chama por aqui}.\n\n{link}',
]

const COLD_OPENERS = [
  '{saudacao}, {primeiro_nome}! {Tudo bem?|Tudo certo?} {Aqui é da|Falo da} {empresa}. {Posso te fazer uma pergunta rápida?|Rapidinho:} {você ainda cuida disso por aí?|é com você que eu falo sobre isso?}',
  '{Oi|Olá|Opa}, {primeiro_nome}, {tudo bem|tudo certo}? {Sou|Falo} da {empresa}. {Faz sentido eu te mandar|Posso te enviar} {uma proposta|mais informações}?',
  '{saudacao}! {Aqui é da {empresa}|{empresa} aqui}. {Vi seu contato|Encontrei vocês} e {fiquei curioso|queria entender}: {vocês já trabalham com isso|isso faz sentido pra vocês} hoje?',
]

const OFFERS = [
  '{Perfeito|Ótimo|Que bom}, {primeiro_nome}! {Segue|Aqui está} {o link|mais detalhes}: {link}\n\n{Qualquer dúvida é só me chamar.|Se quiser, te explico melhor por aqui.}',
  '{Show|Beleza|Combinado}! {Deixo aqui|Separei} {o link|as informações}: {link}\n\n{Me fala o que você precisa que eu te ajudo.|Fico à disposição.}',
]

export function CampaignForm({
  defaultLink,
  tags,
  varKeys = [],
  instances,
}: {
  defaultLink: string
  tags: { tag: string; n: number }[]
  varKeys?: string[]
  instances: { id: string; label: string }[]
}) {
  const [twoStep, setTwoStep] = useState(true)
  const [templates, setTemplates] = useState<string[]>(COLD_OPENERS)
  const [offers, setOffers] = useState<string[]>(OFFERS)
  const [link, setLink] = useState(defaultLink)
  const [appendLink, setAppendLink] = useState(true)
  const [footer, setFooter] = useState(true)
  const [preview, setPreview] = useState<string | null>(null)

  const combos = templates.reduce((sum, t) => sum + (t.trim() ? countCombinations(t) : 0), 0)
  const filled = templates.filter((t) => t.trim()).length
  const openerHasLink = twoStep && templates.some((t) => /\{link\}|https?:\/\//i.test(t))

  function toggleTwoStep(on: boolean) {
    setTwoStep(on)
    setTemplates(on ? COLD_OPENERS : STARTERS)
    setPreview(null)
  }

  function generatePreview() {
    const valid = templates.filter((t) => t.trim())
    if (!valid.length) return
    const ctx = { name: 'Maria Souza', hour: new Date().getHours(), link: link || null }
    const opener = renderMessage(valid[Math.floor(Math.random() * valid.length)], {
      ...ctx,
      link: twoStep ? null : ctx.link,
      appendLink: !twoStep && appendLink,
      optOutFooter: footer,
    })
    const validOffers = offers.filter((t) => t.trim())
    if (!twoStep || !validOffers.length) return setPreview(opener)
    const offer = renderMessage(validOffers[Math.floor(Math.random() * validOffers.length)], { ...ctx, appendLink, optOutFooter: false })
    setPreview(`${opener}\n\n— se responder —\n\n${offer}`)
  }

  return (
    <ActionForm action={createCampaign} className="gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome da campanha" htmlFor="name">
          <Input id="name" name="name" required maxLength={80} placeholder="Prospecção · outubro" />
        </Field>
        <Field label="Enviar pelo número" htmlFor="instance_id" hint="Cada número tem os próprios limites e proteções.">
          <Select id="instance_id" name="instance_id" required defaultValue={instances[0]?.id}>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Público" htmlFor="tag" hint="Só contatos elegíveis entram: quem saiu, não tem WhatsApp ou foi contatado há pouco fica de fora.">
          <Select id="tag" name="tag" defaultValue="">
            <option value="">Todos os contatos</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.n})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Link (opcional)" htmlFor="link_url" hint="Usado no lugar de {link}.">
          <Input id="link_url" name="link_url" type="url" value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>
        <Field label="Máximo de contatos nesta campanha" htmlFor="max_recipients" hint="O limite diário continua valendo: o restante segue nos dias seguintes.">
          <Input id="max_recipients" name="max_recipients" type="number" min={1} max={5000} defaultValue={300} />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4 text-sm">
        <input
          type="checkbox"
          name="two_step"
          checked={twoStep}
          onChange={(e) => toggleTwoStep(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Duas etapas (recomendado para listas frias)</span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            A primeira mensagem é curta, sem link, e termina com uma pergunta. A oferta com o link só vai, minutos depois,
            para quem responder. Quem não tem interesse simplesmente ignora em vez de denunciar. Contatos da Prospecção
            só recebem campanhas nesse modo.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">{twoStep ? 'Variações da abertura (sem link)' : 'Variações da mensagem'}</h3>
          <span className={`text-xs tabular ${combos >= 10 ? 'text-positive' : 'text-attention'}`}>
            {filled} {filled === 1 ? 'variação' : 'variações'} · {combos.toLocaleString('pt-BR')} textos possíveis
            {combos < 10 ? ' · quanto mais variação, menor o risco' : ''}
          </span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Marcadores disponíveis">
          {PLACEHOLDERS.map((p) => (
            <li key={p.token} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs" title={p.hint}>
              <code className="font-mono text-foreground">{p.token}</code>
              <span className="text-muted-foreground"> {p.hint}</span>
            </li>
          ))}
          {varKeys.map((k) => (
            <li key={k} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs" title="Coluna da planilha importada">
              <code className="font-mono text-foreground">{`{${k}}`}</code>
              <span className="text-muted-foreground"> coluna da planilha</span>
            </li>
          ))}
        </ul>
        {templates.map((t, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={`tpl-${i}`} className="text-xs font-medium text-muted-foreground">
                Variação {i + 1}
              </label>
              {templates.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setTemplates((list) => list.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" aria-hidden /> Remover
                </Button>
              ) : null}
            </div>
            <Textarea
              id={`tpl-${i}`}
              name="templates"
              value={t}
              maxLength={2000}
              rows={6}
              onChange={(e) => setTemplates((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              className="font-mono text-[13px]"
            />
          </div>
        ))}
        {templates.length < 20 ? (
          <Button type="button" size="sm" className="self-start" onClick={() => setTemplates((list) => [...list, ''])}>
            <Plus className="size-4" aria-hidden /> Adicionar variação
          </Button>
        ) : null}
        {openerHasLink ? (
          <p role="alert" className="text-xs text-critical">
            Tire o link da abertura: em duas etapas ele vai só na oferta.
          </p>
        ) : null}
      </div>

      {twoStep ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Variações da oferta (para quem responder)</h3>
            <p className="text-xs text-muted-foreground">
              Enviada de 1,5 a 6 minutos depois da resposta, com {'{link}'}. Quem responde &quot;não quero&quot;, &quot;spam&quot; ou
              algo negativo é bloqueado e não recebe a oferta.
            </p>
          </div>
          {offers.map((t, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`offer-${i}`} className="text-xs font-medium text-muted-foreground">
                  Oferta {i + 1}
                </label>
                {offers.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOffers((list) => list.filter((_, j) => j !== i))}>
                    <Trash2 className="size-3.5" aria-hidden /> Remover
                  </Button>
                ) : null}
              </div>
              <Textarea
                id={`offer-${i}`}
                name="followup_templates"
                value={t}
                maxLength={1000}
                rows={5}
                onChange={(e) => setOffers((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                className="font-mono text-[13px]"
              />
            </div>
          ))}
          {offers.length < 6 ? (
            <Button type="button" size="sm" className="self-start" onClick={() => setOffers((list) => [...list, ''])}>
              <Plus className="size-4" aria-hidden /> Adicionar oferta
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="append_link" checked={appendLink} onChange={(e) => setAppendLink(e.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            Incluir o link no final quando {twoStep ? 'a oferta' : 'a variação'} não tiver {'{link}'}
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="opt_out_footer" checked={footer} onChange={(e) => setFooter(e.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            Oferecer descadastro (&quot;responda SAIR&quot;)
            <span className="block text-xs text-muted-foreground">
              Recomendado: quem pode sair com facilidade denuncia menos, e as denúncias são o que mais derruba números.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">Exemplo sorteado (contato: Maria Souza)</span>
          <Button type="button" size="sm" onClick={generatePreview}>
            <RefreshCw className="size-3.5" aria-hidden /> Sortear
          </Button>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{preview ?? 'Clique em Sortear para ver como a mensagem chega.'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Criar campanha</SubmitButton>
        <span className="text-xs text-muted-foreground">A campanha é criada como rascunho. Você envia um teste e só depois inicia.</span>
      </div>
    </ActionForm>
  )
}

'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/forms/action-form'
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { createCampaign } from '@/lib/actions/broadcast'
import { PLACEHOLDERS, countCombinations, renderMessage } from '@/lib/broadcast/text'

const STARTERS = [
  '{saudacao}, {primeiro_nome}! {Tudo bem?|Tudo certo por aí?|Como vai?}\n\n{Separamos|Montamos|Preparamos} uma seleção de metais e acabamentos Deca com {preços especiais|condições especiais|valores bem competitivos} para {projetos e obras|quem está reformando|profissionais e lojas}.\n\n{Dá uma olhada|Confere aqui|Vale a pena ver}: {link}',
  '{Oi|Olá|Opa}, {primeiro_nome}, {tudo bem|tudo certo}? Aqui é da ALURE.\n\n{Atualizamos|Acabamos de atualizar|Renovamos} nosso catálogo Deca, com {duchas, misturadores e acabamentos|metais e acabamentos} {a pronta entrega|com envio rápido}.\n\n{O link é este|Segue o link|Pode ver por aqui}: {link}',
  '{saudacao}! {Passando para avisar|Queria te mostrar|Lembrei de você}: {temos|estamos com} {novidades|uma seleção nova} da Deca no catálogo da ALURE.\n\n{Se tiver algum projeto em andamento|Se estiver precisando de alguma peça|Caso precise de algo}, {é só pedir por aqui|me chama aqui mesmo|respondo por aqui}.\n\n{link}',
]

const COLD_OPENERS = [
  '{saudacao}, {primeiro_nome}! {Tudo bem?|Tudo certo?} Aqui é {o|a equipe} da ALURE, {de metais e acabamentos Deca|trabalhamos com metais Deca}. {Vocês|Você} {costuma|costumam} {comprar|usar} {torneiras e misturadores|metais e acabamentos} {para obras|em projetos}?',
  '{Oi|Olá|Opa}, {primeiro_nome}, {tudo bem|tudo certo}? {Sou|Falo} da ALURE. {Posso te fazer uma pergunta rápida?|Rapidinho:} {vocês estão com alguma obra ou reforma|tem algum projeto de banheiro ou cozinha} {em andamento|rolando agora}?',
  '{saudacao}! {Aqui é da ALURE|Tudo bem? ALURE aqui}, {fornecemos|trabalhamos com} metais e acabamentos Deca {para profissionais|para lojas e obras}. {Faz sentido eu te mandar|Posso te enviar} {nosso catálogo|uma seleção com preços}?',
]

const OFFERS = [
  '{Perfeito|Ótimo|Que bom}, {primeiro_nome}! {Segue|Aqui está} {nosso catálogo|a seleção} com {preços para projeto|condições especiais}: {link}\n\n{Qualquer dúvida é só me chamar.|Se quiser, já monto um orçamento.}',
  '{Show|Beleza|Combinado}! {Separei|Deixo aqui} o {catálogo|link} {com os metais e acabamentos|da ALURE}: {link}\n\n{Me fala o que você precisa que eu te ajudo.|Se tiver uma lista de itens, me manda que eu cotoo.}',
]

export function CampaignForm({ defaultLink, tags }: { defaultLink: string; tags: { tag: string; n: number }[] }) {
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
          <Input id="name" name="name" required maxLength={80} placeholder="Catálogo Deca · maio" />
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
        <Field label="Link do catálogo" htmlFor="link_url">
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
          <span className={`text-xs tabular ${filled >= 3 && combos >= 10 ? 'text-positive' : 'text-attention'}`}>
            {filled} variações · {combos.toLocaleString('pt-BR')} textos possíveis (mínimo: 3 variações e 10 textos)
          </span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Marcadores disponíveis">
          {PLACEHOLDERS.map((p) => (
            <li key={p.token} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs" title={p.hint}>
              <code className="font-mono text-foreground">{p.token}</code>
              <span className="text-muted-foreground"> {p.hint}</span>
            </li>
          ))}
        </ul>
        {templates.map((t, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={`tpl-${i}`} className="text-xs font-medium text-muted-foreground">
                Variação {i + 1}
              </label>
              {templates.length > 3 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setTemplates((list) => list.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" aria-hidden /> Remover
                </Button>
              ) : null}
            </div>
            <Textarea
              id={`tpl-${i}`}
              name="templates"
              value={t}
              maxLength={1000}
              rows={6}
              onChange={(e) => setTemplates((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              className="font-mono text-[13px]"
            />
          </div>
        ))}
        {templates.length < 10 ? (
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
                {offers.length > 2 ? (
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

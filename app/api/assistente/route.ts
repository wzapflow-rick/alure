import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from 'ai'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { getSessionUser, type SessionUser } from '@/lib/session'
import { getEngineSettings } from '@/lib/settings'
import { todayISO } from '@/lib/format'
import {
  getChannelPerformance,
  getConnections,
  getTodayKpis,
  listAlerts,
  listExperiments,
  listFeeRules,
  listMemory,
  listRecommendations,
} from '@/lib/queries'
import {
  UUID_RE,
  ensureConversation,
  getConversationMessages,
  isAssistantStoreReady,
  recentConversationDigest,
  saveMessage,
  searchConversations,
} from '@/lib/assistant/store'

import { prepareModel, recordUsage } from '@/lib/ai/orchestrator'
import { describeAIError } from '@/lib/ai/user-error'
import { refreshTodayIfStale, type FreshnessResult } from '@/lib/sync/freshen'

export const maxDuration = 60

const bodySchema = z.object({
  id: z.string().regex(UUID_RE),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal('user'),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
  }),
})

const INSTRUCTIONS = `Você é o assistente do ALURE OS, sistema de decisão de uma loja de metais sanitários Deca em marketplaces (Mercado Livre, Shopee).

FONTE DA VERDADE
- O banco de dados é a única fonte da verdade. O bloco "CONTEXTO DO BANCO" abaixo foi carregado agora, antes desta resposta.
- Antes de responder qualquer pergunta sobre vendas, pedidos, anúncios, preços, estoque, taxas, testes, integrações ou histórico, CONSULTE as ferramentas. Não responda de cabeça.
- NUNCA peça ao usuário um dado que o sistema consegue buscar (vendas, pedidos, anúncios, preços, estoque, taxas, status da integração). Busque primeiro. Só pergunte o que realmente não existe no banco.
- Nunca invente números. Se a ferramenta não retornar o dado, diga "não tenho esse dado no banco" e diga o que precisa ser sincronizado ou cadastrado.

MEMÓRIA
- Tudo que é conversado fica salvo. Use "buscarConversas" quando o usuário se referir a algo já falado ("como eu disse", "aquele produto", "o que combinamos").
- Quando o usuário informar algo durável — decisão, regra de negócio, preferência, fato sobre a operação, fornecedor, estratégia, meta — chame "registrarMemoria" na mesma resposta, sem pedir permissão, e avise em uma linha curta que registrou.
- Antes de registrar, confira a memória existente para não duplicar. Se a nova informação substitui uma antiga, registre a nova e diga qual ficou desatualizada.
- Respeite a memória: não recomende algo que contradiga uma decisão registrada sem apontar o conflito.

FRESCOR DOS DADOS
- Ao citar números de hoje, informe o horário de kpis_hoje.lastSynced (fuso de São Paulo).
- Se atualizacao_vendas_hoje indicar sincronização incompleta ou falha, diga isso antes dos números e não afirme que "não houve vendas".

ESTILO
- Português do Brasil, direto e curto. Diferencie fato (dado do banco) de hipótese (marque como hipótese).
- Você não altera preços, anúncios nem testes: só explica e registra memória. Ações são feitas pelo usuário na interface.`

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error('[alure] assistant context failed:', err)
    return fallback
  }
}

async function buildDatabaseContext(user: SessionUser, conversationId: string, freshness: FreshnessResult[]) {
  const [connections, kpis, settings, memory, recs, alerts, conversations] = await Promise.all([
    safe(getConnections, []),
    safe(getTodayKpis, null),
    safe(getEngineSettings, null),
    safe(() => listMemory({ status: 'active', limit: 40 }), []),
    safe(() => listRecommendations({ statuses: ['open'], limit: 8 }), []),
    safe(() => listAlerts(['open'], 10), []),
    safe(() => recentConversationDigest(user.id, conversationId), []),
  ])
  const context = {
    hoje: todayISO(),
    usuario: user.name,
    integracoes: connections.map((c) => ({
      canal: c.name,
      status: c.status ?? 'nao_conectado',
      conta: c.account_name,
      ultima_sync: c.last_sync,
      status_ultima_sync: c.last_sync_status,
    })),
    kpis_hoje: kpis,
    atualizacao_vendas_hoje: freshness.map((f) => ({
      canal: f.code,
      resultado:
        f.status === 'fresh' || f.status === 'synced'
          ? 'atualizado agora'
          : f.status === 'running' || f.status === 'timeout'
            ? 'sincronização em andamento; números de hoje podem estar incompletos'
            : `falhou ao atualizar: ${f.detail ?? 'erro desconhecido'}`,
    })),
    meta_diaria: settings?.dailyTarget ?? null,
    memoria_ativa: memory.map((m) => ({
      data: m.memory_date,
      tipo: m.kind,
      assunto: m.subject,
      conteudo: m.decision,
      motivo: m.reason,
      produto: m.product_name,
    })),
    recomendacoes_abertas: recs.map((r) => ({ titulo: r.title, severidade: r.severity, sku: r.sku })),
    alertas_abertos: alerts.map((a) => ({ severidade: a.severity, mensagem: a.message })),
    conversas_anteriores: conversations,
  }
  return `CONTEXTO DO BANCO (carregado agora):\n${JSON.stringify(context)}`
}

function buildTools(user: SessionUser, conversationId: string) {
  const today = todayISO()
  return {
    resumoDoDia: tool({
      description: 'KPIs de hoje (receita, pedidos, ticket médio) e a meta diária configurada.',
      inputSchema: z.object({}),
      execute: async () => ({ kpis: await getTodayKpis(), meta: (await getEngineSettings()).dailyTarget }),
    }),
    vendasPorPeriodo: tool({
      description: 'Vendas diárias por canal (pedidos, unidades, receita) nos últimos N dias, mais o total.',
      inputSchema: z.object({
        dias: z.number().int().min(1).max(365).default(30),
        canal: z.enum(['mercado_livre', 'shopee']).optional().describe('Código do marketplace'),
      }),
      execute: async ({ dias, canal }) => {
        const rows = await query(
          `SELECT sm.metric_date::text AS dia, m.name AS canal, SUM(sm.orders)::int AS pedidos,
                  SUM(sm.units)::int AS unidades, ROUND(SUM(sm.revenue), 2) AS receita
             FROM sales_metrics sm
             JOIN product_channels pc ON pc.id = sm.product_channel_id
             JOIN marketplaces m ON m.id = pc.marketplace_id
            WHERE sm.metric_date > $1::date - $2::int AND sm.metric_date <= $1::date
              AND ($3::text IS NULL OR m.code = $3)
            GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT 400`,
          [today, dias, canal ?? null],
        )
        const total = rows.reduce<{ pedidos: number; unidades: number; receita: number }>(
          (acc, r) => ({
            pedidos: acc.pedidos + Number(r.pedidos),
            unidades: acc.unidades + Number(r.unidades),
            receita: acc.receita + Number(r.receita),
          }),
          { pedidos: 0, unidades: 0, receita: 0 },
        )
        return { dias, total, porDia: rows }
      },
    }),
    maisVendidos: tool({
      description: 'Ranking de produtos por receita nos últimos N dias, com unidades e pedidos.',
      inputSchema: z.object({
        dias: z.number().int().min(1).max(365).default(30),
        limite: z.number().int().min(1).max(50).default(15),
      }),
      execute: async ({ dias, limite }) =>
        query(
          `SELECT p.sku, p.name AS produto, m.name AS canal, SUM(sm.units)::int AS unidades,
                  SUM(sm.orders)::int AS pedidos, ROUND(SUM(sm.revenue), 2) AS receita
             FROM sales_metrics sm
             JOIN product_channels pc ON pc.id = sm.product_channel_id
             JOIN products p ON p.id = pc.product_id
             JOIN marketplaces m ON m.id = pc.marketplace_id
            WHERE sm.metric_date > $1::date - $2::int AND sm.metric_date <= $1::date
            GROUP BY p.sku, p.name, m.name ORDER BY receita DESC LIMIT $3`,
          [today, dias, limite],
        ),
    }),
    pedidos: tool({
      description: 'Pedidos sincronizados dos marketplaces, com itens, nos últimos N dias.',
      inputSchema: z.object({
        dias: z.number().int().min(1).max(90).default(7),
        limite: z.number().int().min(1).max(50).default(20),
        status: z.string().max(40).optional(),
      }),
      execute: async ({ dias, limite, status }) =>
        query(
          `SELECT o.external_id, m.name AS canal, o.status, o.order_date, o.total_amount,
                  COALESCE(json_agg(json_build_object('sku', oi.sku, 'qtd', oi.quantity, 'preco', oi.unit_price))
                    FILTER (WHERE oi.id IS NOT NULL), '[]') AS itens
             FROM orders o
             JOIN marketplaces m ON m.id = o.marketplace_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.order_date > now() - make_interval(days => $1::int)
              AND ($2::text IS NULL OR o.status = $2)
            GROUP BY o.id, m.name ORDER BY o.order_date DESC LIMIT $3`,
          [dias, status ?? null, limite],
        ),
    }),
    anuncios: tool({
      description: 'Anúncios (listings) nos canais: título, preço atual, status, estoque mais recente e visitas 30d.',
      inputSchema: z.object({
        termo: z.string().max(80).optional().describe('Parte do título, SKU ou ID do anúncio'),
        canal: z.enum(['mercado_livre', 'shopee']).optional(),
        limite: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ termo, canal, limite }) =>
        query(
          `SELECT pc.external_id, pc.listing_title, pc.listing_url, m.name AS canal, p.sku, pc.current_price,
                  pc.status, pc.ads_cost_pct, pc.promotion_active,
                  (SELECT quantity FROM inventory_snapshots i WHERE i.product_channel_id = pc.id
                    ORDER BY snapshot_at DESC LIMIT 1) AS estoque,
                  (SELECT SUM(visits) FROM traffic_metrics t WHERE t.product_channel_id = pc.id
                    AND t.metric_date > $1::date - 30) AS visitas_30d
             FROM product_channels pc
             JOIN marketplaces m ON m.id = pc.marketplace_id
             JOIN products p ON p.id = pc.product_id
            WHERE ($2::text IS NULL OR pc.listing_title ILIKE '%' || $2 || '%' OR p.sku ILIKE '%' || $2 || '%'
                   OR pc.external_id ILIKE '%' || $2 || '%')
              AND ($3::text IS NULL OR m.code = $3)
            ORDER BY pc.updated_at DESC LIMIT $4`,
          [today, termo ?? null, canal ?? null, limite],
        ),
    }),
    buscarProduto: tool({
      description: 'Busca produtos por nome ou SKU e retorna canais, preços e custo médio.',
      inputSchema: z.object({ termo: z.string().min(2).max(80) }),
      execute: async ({ termo }) =>
        query(
          `SELECT p.id, p.sku, p.name, p.classification, p.category, pco.average_cost,
                  COALESCE(json_agg(json_build_object('canal', m.name, 'preco', pc.current_price, 'status', pc.status, 'ads_pct', pc.ads_cost_pct))
                    FILTER (WHERE pc.id IS NOT NULL), '[]') AS canais
             FROM products p
        LEFT JOIN product_costs pco ON pco.product_id = p.id
        LEFT JOIN product_channels pc ON pc.product_id = p.id
        LEFT JOIN marketplaces m ON m.id = pc.marketplace_id
            WHERE p.name ILIKE '%' || $1 || '%' OR p.sku ILIKE '%' || $1 || '%'
            GROUP BY p.id, pco.average_cost LIMIT 10`,
          [termo],
        ),
    }),
    desempenhoCanais: tool({
      description: 'Receita, pedidos e visitas por canal: janela atual vs. janela anterior de mesmo tamanho.',
      inputSchema: z.object({ dias: z.number().int().min(1).max(90).default(7) }),
      execute: async ({ dias }) => getChannelPerformance(dias),
    }),
    taxas: tool({
      description: 'Regras de taxa/comissão cadastradas por marketplace.',
      inputSchema: z.object({}),
      execute: async () => listFeeRules(),
    }),
    integracoes: tool({
      description: 'Status das conexões com marketplaces e últimas sincronizações (com erros, se houver).',
      inputSchema: z.object({}),
      execute: async () => ({
        conexoes: await getConnections(),
        ultimasSyncs: await query(
          `SELECT m.name AS canal, sj.job_type, sj.status, sj.records_processed, sj.error, sj.finished_at
             FROM sync_jobs sj JOIN marketplaces m ON m.id = sj.marketplace_id
            ORDER BY sj.created_at DESC LIMIT 8`,
        ),
      }),
    }),
    recomendacoes: tool({
      description: 'Prioridades e oportunidades abertas geradas pelo motor determinístico, com evidências.',
      inputSchema: z.object({ tipo: z.enum(['priority', 'opportunity']).optional() }),
      execute: async ({ tipo }) =>
        listRecommendations({ kinds: tipo ? [tipo] : undefined, statuses: ['open'], limit: 15 }),
    }),
    alertas: tool({
      description: 'Alertas abertos ou reconhecidos.',
      inputSchema: z.object({}),
      execute: async () => listAlerts(['open', 'acknowledged'], 30),
    }),
    testes: tool({
      description: 'Testes (experimentos) planejados, em andamento ou prontos para revisão.',
      inputSchema: z.object({}),
      execute: async () => listExperiments({ statuses: ['in_progress', 'ready_for_review', 'planned'] }),
    }),
    memoria: tool({
      description: 'Memória estratégica completa ou filtrada por termo (decisões, regras, contexto).',
      inputSchema: z.object({ termo: z.string().max(80).optional() }),
      execute: async ({ termo }) =>
        termo
          ? query(
              `SELECT to_char(memory_date,'YYYY-MM-DD') AS data, kind AS tipo, subject AS assunto,
                      decision AS conteudo, reason AS motivo, status
                 FROM strategic_memory
                WHERE subject ILIKE '%' || $1 || '%' OR decision ILIKE '%' || $1 || '%' OR reason ILIKE '%' || $1 || '%'
                ORDER BY memory_date DESC LIMIT 30`,
              [termo],
            )
          : listMemory({ status: 'active', limit: 100 }),
    }),
    buscarConversas: tool({
      description: 'Busca em todas as conversas anteriores do usuário com o assistente.',
      inputSchema: z.object({ termo: z.string().min(2).max(120) }),
      execute: async ({ termo }) => searchConversations(user.id, termo),
    }),
    registrarMemoria: tool({
      description:
        'Grava na memória estratégica uma informação durável dita pelo usuário: decisão, regra de negócio ou contexto/fato da operação.',
      inputSchema: z.object({
        tipo: z.enum(['decision', 'rule', 'context']),
        assunto: z.string().min(3).max(160),
        conteudo: z.string().min(3).max(2000),
        motivo: z.string().max(1000).optional(),
        resultadoEsperado: z.string().max(1000).optional(),
        sku: z.string().max(60).optional().describe('SKU do produto relacionado, se houver'),
      }),
      execute: async ({ tipo, assunto, conteudo, motivo, resultadoEsperado, sku }) => {
        const product = sku
          ? await queryOne<{ id: string }>('SELECT id FROM products WHERE sku ILIKE $1 LIMIT 1', [sku])
          : null
        const row = await queryOne<{ id: string }>(
          `INSERT INTO strategic_memory (kind, subject, decision, reason, expected_result, product_id, user_id, source, conversation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'assistant', $8) RETURNING id`,
          [tipo, assunto, conteudo, motivo ?? null, resultadoEsperado ?? null, product?.id ?? null, user.id, conversationId],
        )
        await query(
          `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, new_value, reason)
           VALUES ($1, $2, 'memory.create', 'strategic_memory', $3, $4::jsonb, 'Registrado pelo assistente')`,
          [user.id, user.email, row?.id ?? null, JSON.stringify({ tipo, assunto, conteudo })],
        )
        return { registrado: true, id: row?.id, produtoVinculado: Boolean(product) }
      },
    }),
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return new Response('Não autorizado', { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response('Requisição inválida', { status: 400 })
  const { id: conversationId, message } = parsed.data

  const text = message.parts
    .map((p) => (p.type === 'text' ? (p.text ?? '') : ''))
    .join('\n')
    .trim()
    .slice(0, 8000)
  if (!text) return new Response('Mensagem vazia', { status: 400 })
  const userMessage: UIMessage = { id: message.id, role: 'user', parts: [{ type: 'text', text }] }

  const prepared = prepareModel('ASSISTANT_QUERY')
  if (!prepared) {
    return new Response('IA não configurada neste deploy. Configure OPENAI_API_KEY na Vercel e publique de novo.', {
      status: 503,
    })
  }

  let messages: UIMessage[]
  let dbContext: string
  try {
    if (!(await isAssistantStoreReady())) {
      return new Response('Rode o script db/003_assistant_memory.sql no banco para ativar a memória do assistente.', {
        status: 503,
      })
    }
    if (!(await ensureConversation(user.id, conversationId, text))) {
      return new Response('Conversa não encontrada', { status: 404 })
    }
    const history = (await getConversationMessages(user.id, conversationId, 40)) ?? []
    await saveMessage(conversationId, userMessage)
    messages = [...history.filter((m) => m.id !== userMessage.id), userMessage]
    const freshness = await safe(refreshTodayIfStale, [])
    dbContext = await buildDatabaseContext(user, conversationId, freshness)
  } catch (err) {
    console.error('[alure] assistant setup failed:', err)
    return new Response(describeAIError(err), { status: 503 })
  }
  const startedAt = Date.now()
  const result = streamText({
    model: prepared.model,
    instructions: `${INSTRUCTIONS}\n\n${dbContext}`,
    messages: await convertToModelMessages(messages),
    stopWhen: isStepCount(8),
    tools: buildTools(user, conversationId),
    onFinish: async (event) => {
      await recordUsage(prepared, {
        startedAt,
        usage: event.totalUsage,
        providerMetadata: event.providerMetadata,
        ok: true,
        userId: user.id,
      }).catch(() => undefined)
    },
    onError: async ({ error }) => {
      console.error('[alure] assistant stream failed:', error)
      await recordUsage(prepared, { startedAt, ok: false, error, userId: user.id }).catch(() => undefined)
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: describeAIError,
      generateMessageId: () => crypto.randomUUID(),
      onEnd: async ({ responseMessage }) => {
        try {
          if (responseMessage.parts.length) await saveMessage(conversationId, responseMessage)
        } catch (err) {
          console.error('[alure] failed to persist assistant message:', err)
        }
      },
    }),
  })
}

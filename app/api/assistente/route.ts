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
import { query } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getEngineSettings } from '@/lib/settings'
import { getTodayKpis, listAlerts, listExperiments, listMemory, listRecommendations } from '@/lib/queries'

export const maxDuration = 60

const INSTRUCTIONS = `Você é o assistente do ALURE OS, um sistema de decisão para uma loja de metais sanitários Deca em marketplaces.
Regras inegociáveis:
- Responda em português do Brasil, de forma direta e curta.
- Use SOMENTE os dados retornados pelas ferramentas. Nunca invente números, preços, taxas ou resultados.
- Se um dado não existir, diga claramente "não tenho esse dado" e indique o que precisa ser cadastrado ou sincronizado.
- Você não executa ações: só explica. Mudanças de preço, testes e decisões são feitas pelo usuário na interface.
- Diferencie fato (dado) de hipótese (interpretação). Marque hipóteses como tal.
- Considere a memória estratégica antes de recomendar algo que contradiga uma decisão já registrada.`

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return new Response('Não autorizado', { status: 401 })

  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: 'openai/gpt-5.5',
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    stopWhen: isStepCount(6),
    tools: {
      resumoDoDia: tool({
        description: 'KPIs de hoje (receita, pedidos) e a meta diária configurada.',
        inputSchema: z.object({}),
        execute: async () => ({ kpis: await getTodayKpis(), meta: (await getEngineSettings()).dailyTarget }),
      }),
      recomendacoes: tool({
        description: 'Prioridades e oportunidades abertas geradas pelo motor determinístico, com evidências.',
        inputSchema: z.object({ tipo: z.enum(['priority', 'opportunity']).optional() }),
        execute: async ({ tipo }) =>
          listRecommendations({ kinds: tipo ? [tipo] : undefined, statuses: ['open'], limit: 15 }),
      }),
      alertas: tool({
        description: 'Alertas abertos.',
        inputSchema: z.object({}),
        execute: async () => listAlerts(['open', 'acknowledged'], 30),
      }),
      testes: tool({
        description: 'Testes (experimentos) em andamento ou prontos para revisão.',
        inputSchema: z.object({}),
        execute: async () => listExperiments({ statuses: ['in_progress', 'ready_for_review', 'planned'] }),
      }),
      memoria: tool({
        description: 'Memória estratégica: decisões, regras e contexto já registrados.',
        inputSchema: z.object({}),
        execute: async () => listMemory({ status: 'active', limit: 40 }),
      }),
      buscarProduto: tool({
        description: 'Busca produtos por nome ou SKU e retorna canais, preços e custo médio.',
        inputSchema: z.object({ termo: z.string().min(2).max(80) }),
        execute: async ({ termo }) =>
          query(
            `SELECT p.id, p.sku, p.name, p.classification, p.category,
                    (SELECT ROUND(SUM(quantity*unit_cost)/NULLIF(SUM(quantity),0),2) FROM product_cost_lots WHERE product_id=p.id AND active) AS average_cost,
                    COALESCE(json_agg(json_build_object('marketplace', m.name, 'price', pc.current_price, 'status', pc.status, 'ads_pct', pc.ads_cost_pct))
                      FILTER (WHERE pc.id IS NOT NULL), '[]') AS channels
               FROM products p
          LEFT JOIN product_channels pc ON pc.product_id = p.id
          LEFT JOIN marketplaces m ON m.id = pc.marketplace_id
              WHERE p.name ILIKE $1 OR p.sku ILIKE $1
           GROUP BY p.id LIMIT 10`,
            [`%${termo}%`],
          ),
      }),
    },
  })

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })
}

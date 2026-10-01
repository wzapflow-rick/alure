import 'server-only'
import { pool, query, queryOne, withTransaction } from '@/lib/db'
import { recomputeProductCost } from '@/lib/costs'
import { todayISO } from '@/lib/format'
import { getActiveFeeRules } from '@/lib/pricing/service'
import { loadChannelStats, runEngine } from '@/lib/engine/run'
import { getEngineSettings } from '@/lib/settings'
import { listExperiments, listMemory, listRecommendations } from '@/lib/queries'
import type { SessionUser } from '@/lib/session'

export type SelfTestStep = { name: string; ok: boolean; detail: string }
export type SelfTestReport = { ok: boolean; tag: string; durationMs: number; steps: SelfTestStep[] }

const EXPECTED_TABLES = [
  'user', 'session', 'account', 'verification', 'marketplaces', 'marketplace_connections', 'products',
  'product_channels', 'product_cost_history', 'product_costs', 'orders', 'order_items', 'sales_metrics',
  'traffic_metrics', 'advertising_campaigns', 'advertising_metrics', 'promotions', 'promotion_products',
  'price_history', 'inventory_snapshots', 'fee_rules', 'experiments', 'experiment_metrics', 'recommendations',
  'recommendation_events', 'alerts', 'strategic_memory', 'app_settings', 'daily_summaries', 'sync_jobs', 'audit_logs',
]

class StepFailure extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new StepFailure(message)
}

/**
 * End-to-end persistence check against the real database.
 * Every row it creates is labeled DEMO and removed at the end, even on failure.
 */
export async function runPostgresSelfTest(user: SessionUser | null): Promise<SelfTestReport> {
  const started = Date.now()
  const tag = `DEMO-TESTE-${Date.now()}`
  const steps: SelfTestStep[] = []
  const ids: { productId?: number; channelId?: number; feeRuleId?: number; experimentId?: number } = {}

  async function step(name: string, fn: () => Promise<string>) {
    try {
      steps.push({ name, ok: true, detail: await fn() })
      return true
    } catch (error) {
      const detail = error instanceof StepFailure ? error.message : `Erro do banco: ${(error as Error).message}`
      steps.push({ name, ok: false, detail })
      return false
    }
  }

  const today = todayISO()

  const sequence: [string, () => Promise<string>][] = [
    ['Conexão com o PostgreSQL', async () => {
      const row = await queryOne<{ db: string; usr: string; version: string }>(
        `SELECT current_database() AS db, current_user AS usr, split_part(version(), ' ', 2) AS version`,
      )
      assert(row, 'Consulta de conexão não retornou linha.')
      return `Banco "${row.db}" como "${row.usr}", PostgreSQL ${row.version}.`
    }],

    ['Migrations (schema 001)', async () => {
      const rows = await query<{ name: string; exists: boolean }>(
        `SELECT t AS name, to_regclass('public.' || quote_ident(t)) IS NOT NULL AS exists FROM unnest($1::text[]) AS t`,
        [EXPECTED_TABLES],
      )
      const missing = rows.filter((r) => !r.exists).map((r) => r.name)
      assert(missing.length === 0, `Tabelas ausentes: ${missing.join(', ')}. Rode db/001_schema.sql.`)
      const seeded = await query<{ code: string }>(`SELECT code FROM marketplaces ORDER BY code`)
      assert(seeded.some((m) => m.code === 'mercado_livre'), 'Seed de marketplaces ausente (mercado_livre).')
      return `${EXPECTED_TABLES.length}/${EXPECTED_TABLES.length} tabelas presentes. Marketplaces: ${seeded.map((m) => m.code).join(', ')}.`
    }],

    ['Criar produto', async () => {
      const marketplace = await queryOne<{ id: string }>(`SELECT id FROM marketplaces WHERE code = 'mercado_livre'`)
      assert(marketplace, 'Marketplace mercado_livre não encontrado.')
      const product = await queryOne<{ id: string }>(
        `INSERT INTO products (sku, name, category, notes, classification)
         VALUES ($1, $2, $1, 'DEMO — criado pelo teste interno e removido ao final.', 'em_teste') RETURNING id`,
        [tag, `DEMO · Produto de teste interno`],
      )
      ids.productId = Number(product!.id)
      const channel = await queryOne<{ id: string }>(
        `INSERT INTO product_channels (product_id, marketplace_id, listing_title, current_price, ads_cost_pct)
         VALUES ($1, $2, 'DEMO · anúncio de teste', 100, 0) RETURNING id`,
        [ids.productId, marketplace.id],
      )
      ids.channelId = Number(channel!.id)
      const back = await queryOne<{ sku: string }>(`SELECT sku FROM products WHERE id = $1`, [ids.productId])
      assert(back?.sku === tag, 'Produto não foi lido de volta.')
      return `Produto #${ids.productId} e canal #${ids.channelId} gravados e relidos.`
    }],

    ['Gravar custos (lotes + média ponderada)', async () => {
      assert(ids.productId, 'Sem produto.')
      const average = await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO product_cost_history (product_id, quantity, unit_cost, effective_date, supplier, notes)
           VALUES ($1, 10, 120, $2::date - 10, 'DEMO', 'DEMO lote A'), ($1, 30, 80, $2::date, 'DEMO', 'DEMO lote B')`,
          [ids.productId, today],
        )
        return recomputeProductCost(client, ids.productId!)
      })
      const stored = await queryOne<{ average_cost: string; acquisition_cost: string }>(
        `SELECT average_cost, acquisition_cost FROM product_costs WHERE product_id = $1`,
        [ids.productId],
      )
      assert(stored, 'product_costs não foi gravado.')
      assert(Number(stored.average_cost) === 90, `Média esperada 90, banco tem ${stored.average_cost}.`)
      assert(Number(stored.acquisition_cost) === 80, `Último custo esperado 80, banco tem ${stored.acquisition_cost}.`)
      return `2 lotes (10×120 e 30×80). Média ponderada no banco: ${average}. Último custo: 80.`
    }],

    ['Histórico de custos', async () => {
      const lots = await query<{ id: string; unit_cost: string }>(
        `SELECT id, unit_cost FROM product_cost_history WHERE product_id = $1 ORDER BY effective_date`,
        [ids.productId],
      )
      assert(lots.length === 2, `Esperados 2 lotes, encontrados ${lots.length}.`)
      const lotB = lots.find((l) => Number(l.unit_cost) === 80)!
      await withTransaction(async (client) => {
        await client.query(`UPDATE product_cost_history SET active = false WHERE id = $1`, [lotB.id])
        await recomputeProductCost(client, ids.productId!)
      })
      const stored = await queryOne<{ average_cost: string }>(
        `SELECT average_cost FROM product_costs WHERE product_id = $1`,
        [ids.productId],
      )
      assert(Number(stored?.average_cost) === 120, `Após desativar o lote B, média esperada 120, banco tem ${stored?.average_cost}.`)
      return 'Lote B desativado e mantido no histórico. Média recalculada para 120.'
    }],

    ['Motor de preços lê do PostgreSQL', async () => {
      const marketplace = await queryOne<{ id: string }>(`SELECT id FROM marketplaces WHERE code = 'mercado_livre'`)
      // Category equals the DEMO tag so this rule can only ever match the DEMO product.
      const rule = await queryOne<{ id: string }>(
        `INSERT INTO fee_rules (marketplace_id, name, percentage_fee, fixed_fee, category, effective_from, notes)
         VALUES ($1, 'DEMO · regra de teste interno', 16, 6, $2, $3::date, 'DEMO — removida ao final do teste.') RETURNING id`,
        [marketplace!.id, tag, today],
      )
      ids.feeRuleId = Number(rule!.id)

      const rules = await getActiveFeeRules(today)
      const mlRules = rules.get(Number(marketplace!.id)) ?? []
      assert(mlRules.some((r) => r.id === ids.feeRuleId), 'Regra de taxa DEMO não veio do banco.')

      const settings = await getEngineSettings()
      const channels = await loadChannelStats(today, settings.windowDays, settings.targetMarginPct)
      const ch = channels.find((c) => c.productChannelId === ids.channelId)
      assert(ch, 'Canal DEMO não foi carregado pelo motor.')
      assert(ch.pricing.status === 'ok', `Precificação não calculou: ${ch.pricing.status}.`)
      assert(ch.pricing.rule.id === ids.feeRuleId, 'Motor escolheu outra regra de taxa.')
      assert(ch.pricing.cost === 120, `Custo esperado 120 (do banco), motor usou ${ch.pricing.cost}.`)
      return `Preço 100, taxas ${ch.pricing.marketplaceFees}, custo ${ch.pricing.cost} (do banco). Margem ${ch.pricing.contributionMargin} (${ch.pricing.marginPct}%).`
    }],

    ['Recomendações leem do PostgreSQL', async () => {
      const summary = await runEngine(user)
      const recs = await listRecommendations({ productId: ids.productId, statuses: ['open'] })
      const r4 = recs.find((r) => r.rule_code === 'R4_LOW_MARGIN')
      assert(r4, `Motor não gerou R4_LOW_MARGIN para o produto DEMO (gerou: ${recs.map((r) => r.rule_code).join(', ') || 'nada'}).`)
      assert(r4.severity === 'critical', `Severidade esperada critical, veio ${r4.severity}.`)
      return `Motor analisou ${summary.channelsAnalyzed} canal(is). R4_LOW_MARGIN crítica gravada e relida (#${r4.id}).`
    }],

    ['Decisões estratégicas persistem', async () => {
      const recs = await listRecommendations({ productId: ids.productId, statuses: ['open'] })
      const rec = recs.find((r) => r.rule_code === 'R4_LOW_MARGIN')
      assert(rec, 'Recomendação DEMO não encontrada.')
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE recommendations SET status = 'approved', resolved_at = now(), updated_at = now() WHERE id = $1`,
          [rec.id],
        )
        await client.query(
          `INSERT INTO recommendation_events (recommendation_id, event, note, user_id) VALUES ($1, 'approved', 'DEMO', $2)`,
          [rec.id, user?.id ?? null],
        )
        await client.query(
          `INSERT INTO strategic_memory (kind, subject, decision, reason, product_id, user_id)
           VALUES ('decision', 'DEMO · decisão de teste', 'DEMO · aprovar ajuste de preço', 'DEMO', $1, $2)`,
          [ids.productId, user?.id ?? null],
        )
      })
      const status = await queryOne<{ status: string }>(`SELECT status FROM recommendations WHERE id = $1`, [rec.id])
      assert(status?.status === 'approved', 'Status da recomendação não foi gravado.')
      const memory = await listMemory({ productId: ids.productId })
      assert(memory.some((m) => m.subject === 'DEMO · decisão de teste'), 'Memória estratégica não foi relida.')
      return 'Recomendação aprovada com evento registrado. Decisão gravada na memória estratégica.'
    }],

    ['Testes comerciais (experimentos) persistem', async () => {
      const exp = await queryOne<{ id: string }>(
        `INSERT INTO experiments (product_id, product_channel_id, marketplace_id, variable, previous_value, new_value,
                                  hypothesis, start_date, evaluation_date, primary_metric, status, created_by)
         SELECT pc.product_id, pc.id, pc.marketplace_id, 'price', '100', '95', 'DEMO · hipótese de teste',
                $2::date, $2::date + 7, 'orders', 'in_progress', $3
           FROM product_channels pc WHERE pc.id = $1 RETURNING id`,
        [ids.channelId, today, user?.id ?? null],
      )
      ids.experimentId = Number(exp!.id)
      const open = await listExperiments({ productId: ids.productId, statuses: ['in_progress'] })
      assert(open.some((e) => Number(e.id) === ids.experimentId), 'Experimento não foi relido.')

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE experiments SET status = 'completed', decision = 'keep', result = 'DEMO', decided_by = $2,
                  decided_at = now(), updated_at = now() WHERE id = $1`,
          [ids.experimentId, user?.id ?? null],
        )
        await client.query(
          `INSERT INTO strategic_memory (kind, subject, decision, product_id, experiment_id, user_id)
           VALUES ('decision', 'DEMO · resultado do teste', 'DEMO · manter 95', $1, $2, $3)`,
          [ids.productId, ids.experimentId, user?.id ?? null],
        )
      })
      const done = await listExperiments({ productId: ids.productId, statuses: ['completed'] })
      const row = done.find((e) => Number(e.id) === ids.experimentId)
      assert(row?.decision === 'keep', 'Decisão do experimento não foi gravada.')
      return `Experimento #${ids.experimentId} criado, relido e concluído com decisão "keep".`
    }],
  ]

  for (const [name, fn] of sequence) {
    if (!(await step(name, fn))) break
  }

  await step('Limpeza dos dados DEMO', async () => {
    await withTransaction(async (client) => {
      if (ids.productId) {
        await client.query(`DELETE FROM strategic_memory WHERE product_id = $1`, [ids.productId])
        await client.query(`DELETE FROM experiments WHERE product_id = $1`, [ids.productId])
        await client.query(`DELETE FROM products WHERE id = $1`, [ids.productId])
      }
      if (ids.feeRuleId) await client.query(`DELETE FROM fee_rules WHERE id = $1`, [ids.feeRuleId])
    })
    const left = await queryOne<{ n: string }>(
      `SELECT (SELECT count(*) FROM products WHERE sku = $1) + (SELECT count(*) FROM fee_rules WHERE category = $1) AS n`,
      [tag],
    )
    assert(Number(left?.n) === 0, 'Sobraram registros DEMO no banco.')
    return 'Todos os registros DEMO foram removidos. O log de auditoria do motor é mantido.'
  })

  return { ok: steps.every((s) => s.ok), tag, durationMs: Date.now() - started, steps }
}

export async function closePool() {
  await pool.end()
}

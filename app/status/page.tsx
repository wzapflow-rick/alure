import { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Status do banco — ALURE OS', robots: { index: false } }

type Check = { label: string; ok: boolean; detail: string }

function describeTarget() {
  const raw = process.env.DATABASE_URL
  if (!raw) return null
  try {
    const url = new URL(raw)
    return {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.replace(/^\//, '') || '(padrão)',
      user: decodeURIComponent(url.username) || '(vazio)',
      ssl: url.searchParams.get('sslmode') ?? process.env.DATABASE_SSL ?? 'não definido',
    }
  } catch {
    return { host: 'URL inválida', port: '-', database: '-', user: '-', ssl: '-' }
  }
}

function sslFor(raw: string) {
  const mode = process.env.DATABASE_SSL
  if (mode === 'disable') return false
  if (mode === 'require' || raw.includes('sslmode=require')) return { rejectUnauthorized: false }
  return undefined
}

async function runChecks(): Promise<{ checks: Check[]; ms: number }> {
  const raw = process.env.DATABASE_URL
  const checks: Check[] = []
  const started = Date.now()

  if (!raw) {
    checks.push({ label: 'DATABASE_URL', ok: false, detail: 'Variável não definida neste ambiente.' })
    return { checks, ms: 0 }
  }
  checks.push({ label: 'DATABASE_URL', ok: true, detail: 'Variável definida.' })

  const pool = new Pool({
    connectionString: raw.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, ''),
    ssl: sslFor(raw),
    max: 1,
    connectionTimeoutMillis: 8_000,
  })

  try {
    const [info] = (
      await pool.query<{ version: string; db: string; usr: string }>(
        'select version() as version, current_database() as db, current_user as usr',
      )
    ).rows
    checks.push({
      label: 'Conexão',
      ok: true,
      detail: `Conectado em "${info.db}" como "${info.usr}". ${info.version.split(' on ')[0]}`,
    })

    const tables = (
      await pool.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
      )
    ).rows.map((r) => r.table_name)
    checks.push({
      label: 'Tabelas',
      ok: tables.length > 0,
      detail: tables.length
        ? `${tables.length} tabelas: ${tables.join(', ')}`
        : 'Nenhuma tabela no schema public. Rode o script 001_schema.sql.',
    })

    try {
      await pool.query('select 1 from "user" limit 1')
      checks.push({ label: 'Permissão de leitura', ok: true, detail: 'Leitura na tabela "user" funcionou.' })
    } catch (error) {
      checks.push({ label: 'Permissão de leitura', ok: false, detail: errorText(error) })
    }
  } catch (error) {
    checks.push({ label: 'Conexão', ok: false, detail: errorText(error) })
  } finally {
    await pool.end().catch(() => {})
  }

  return { checks, ms: Date.now() - started }
}

function errorText(error: unknown) {
  const e = error as { code?: string; message?: string }
  return [e.code, e.message].filter(Boolean).join(' — ') || 'Erro desconhecido'
}

export default async function StatusPage() {
  const target = describeTarget()
  const { checks, ms } = await runChecks()
  const allOk = checks.every((c) => c.ok)
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'desconhecido'

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          ALURE OS · ambiente {env}
        </p>
        <h1 className="text-balance text-3xl font-semibold">
          {allOk ? 'Banco conectado' : 'Banco não conectado'}
        </h1>
        <p className={allOk ? 'text-primary' : 'text-destructive'}>
          {allOk
            ? `Tudo certo. Verificação em ${ms} ms.`
            : 'Uma ou mais verificações falharam. Veja os detalhes abaixo.'}
        </p>
      </header>

      {target && (
        <section aria-labelledby="alvo" className="flex flex-col gap-3 rounded-lg border border-border p-5">
          <h2 id="alvo" className="text-sm font-medium text-muted-foreground">
            Destino da DATABASE_URL (senha oculta)
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-sm">
            <dt className="text-muted-foreground">host</dt>
            <dd className="break-all">{target.host}</dd>
            <dt className="text-muted-foreground">porta</dt>
            <dd>{target.port}</dd>
            <dt className="text-muted-foreground">banco</dt>
            <dd>{target.database}</dd>
            <dt className="text-muted-foreground">usuário</dt>
            <dd>{target.user}</dd>
            <dt className="text-muted-foreground">ssl</dt>
            <dd>{target.ssl}</dd>
          </dl>
        </section>
      )}

      <ul className="flex flex-col gap-3">
        {checks.map((check) => (
          <li key={check.label} className="flex gap-4 rounded-lg border border-border p-5">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${check.ok ? 'bg-primary' : 'bg-destructive'}`}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-medium">
                {check.label} <span className="sr-only">{check.ok ? 'ok' : 'falhou'}</span>
              </p>
              <p className="break-words text-sm leading-relaxed text-muted-foreground">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        Recarregue a página para testar de novo. Esta página não mostra senhas.
      </p>
    </main>
  )
}

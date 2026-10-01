import 'server-only'
import { Pool, type QueryResultRow } from 'pg'

declare global {
  var __alurePool: Pool | undefined
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

const SSL_URL_PARAMS = ['sslmode', 'uselibpqcompat', 'sslcert', 'sslkey', 'sslrootcert']

/**
 * pg warns when the URL carries sslmode=require (it is silently upgraded to verify-full).
 * The SSL settings are therefore read from the URL once and passed to pg explicitly,
 * keeping today's behavior: certificate verified unless DATABASE_SSL says otherwise.
 */
function parseDatabaseUrl(raw: string | undefined) {
  if (!raw) return { connectionString: raw, urlSslMode: null as string | null }
  try {
    const url = new URL(raw)
    const urlSslMode = url.searchParams.get('sslmode')
    for (const param of SSL_URL_PARAMS) url.searchParams.delete(param)
    return { connectionString: url.toString(), urlSslMode }
  } catch {
    return { connectionString: raw, urlSslMode: null }
  }
}

function sslConfig(urlSslMode: string | null) {
  const mode = process.env.DATABASE_SSL ?? urlSslMode
  if (!mode || mode === 'disable') return false
  if (mode === 'no-verify' || process.env.DATABASE_SSL === 'require') return { rejectUnauthorized: false }
  return { rejectUnauthorized: true }
}

function createPool() {
  const { connectionString, urlSslMode } = parseDatabaseUrl(process.env.DATABASE_URL)
  return new Pool({
    connectionString,
    ssl: sslConfig(urlSslMode),
    // PgBouncer on the VPS drops bursts above ~10 simultaneous clients; each
    // serverless instance keeps a small pool so many instances can coexist.
    max: 3,
    idleTimeoutMillis: 5_000,
    // Covers both the TCP handshake and waiting in line for a free pool slot:
    // pages fire up to 8 parallel queries against max 3, and a running sync
    // holds one slot, so 5s was too tight over the VPS link.
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  })
}

function isConnectionError(error: unknown) {
  const message = (error as Error)?.message ?? ''
  return /timeout exceeded when trying to connect|Connection terminated|ECONNRESET|ECONNREFUSED/i.test(message)
}

export const pool: Pool = globalThis.__alurePool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalThis.__alurePool = pool

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await pool.query<T>(text, params)
    return result.rows
  } catch (error) {
    if (!isConnectionError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 300))
    const result = await pool.query<T>(text, params)
    return result.rows
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>) {
  let client: import('pg').PoolClient
  try {
    client = await pool.connect()
  } catch (error) {
    if (!isConnectionError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 500))
    client = await pool.connect()
  }
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type DbStatus = 'missing_env' | 'unreachable' | 'missing_schema' | 'ready'

export async function getDbStatus(): Promise<DbStatus> {
  if (!isDbConfigured()) return 'missing_env'
  try {
    const row = await queryOne<{ ok: string | null }>(
      "SELECT to_regclass('public.audit_logs')::text AS ok",
    )
    return row?.ok ? 'ready' : 'missing_schema'
  } catch (error) {
    console.error('[alure] database unreachable:', (error as Error).message)
    return 'unreachable'
  }
}

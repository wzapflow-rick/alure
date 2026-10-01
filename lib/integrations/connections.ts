import 'server-only'
import { pool, withTransaction } from '@/lib/db'
import { decryptToken, encryptToken } from '@/lib/crypto'

export type TokenSet = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scopes: string[]
}

export type ActiveConnection = {
  id: string
  marketplaceId: number
  externalAccountId: string
  accessToken: string
  expiresAt: Date | null
}

async function marketplaceId(code: string) {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM marketplaces WHERE code = $1', [code])
  const id = Number(rows[0]?.id)
  if (!id) throw new Error(`Marketplace não cadastrado: ${code}`)
  return id
}

export async function saveConnection(
  code: string,
  account: { externalAccountId: string; accountName: string | null },
  tokens: TokenSet,
  userId: string,
) {
  const mpId = await marketplaceId(code)
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO marketplace_connections
       (marketplace_id, status, external_account_id, account_name, access_token_enc, refresh_token_enc,
        token_expires_at, scopes, connected_by, connected_at, last_error, updated_at)
     VALUES ($1,'connected',$2,$3,$4,$5, now() + make_interval(secs => $6), $7, $8, now(), NULL, now())
     ON CONFLICT (marketplace_id, external_account_id) DO UPDATE SET
       status = 'connected', account_name = EXCLUDED.account_name,
       access_token_enc = EXCLUDED.access_token_enc, refresh_token_enc = EXCLUDED.refresh_token_enc,
       token_expires_at = EXCLUDED.token_expires_at, scopes = EXCLUDED.scopes,
       connected_by = EXCLUDED.connected_by, connected_at = now(), last_error = NULL, updated_at = now()
     RETURNING id`,
    [
      mpId,
      account.externalAccountId,
      account.accountName,
      encryptToken(tokens.accessToken),
      tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      tokens.expiresIn,
      tokens.scopes,
      userId,
    ],
  )
  return rows[0].id
}

/**
 * Returns a usable access token, refreshing it when it is about to expire.
 * The row is locked so two concurrent syncs never spend the single-use refresh token twice.
 */
export async function getActiveConnection(
  code: string,
  refresh: (refreshToken: string, externalAccountId: string) => Promise<TokenSet>,
): Promise<ActiveConnection | null> {
  const mpId = await marketplaceId(code)
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string
      external_account_id: string
      access_token_enc: string
      refresh_token_enc: string | null
      token_expires_at: Date | null
    }>(
      `SELECT id, external_account_id, access_token_enc, refresh_token_enc, token_expires_at
         FROM marketplace_connections
        WHERE marketplace_id = $1 AND status = 'connected'
        ORDER BY updated_at DESC LIMIT 1
        FOR UPDATE`,
      [mpId],
    )
    const row = rows[0]
    if (!row) return null

    const expiresSoon = !row.token_expires_at || row.token_expires_at.getTime() - Date.now() < 5 * 60 * 1000
    if (!expiresSoon) {
      return {
        id: row.id,
        marketplaceId: mpId,
        externalAccountId: row.external_account_id,
        accessToken: decryptToken(row.access_token_enc),
        expiresAt: row.token_expires_at,
      }
    }

    if (!row.refresh_token_enc) {
      await client.query(
        `UPDATE marketplace_connections SET status='expired', last_error=$2, updated_at=now() WHERE id=$1`,
        [row.id, 'Token expirado e sem refresh token. Conecte novamente.'],
      )
      return null
    }

    try {
      const next = await refresh(decryptToken(row.refresh_token_enc), row.external_account_id)
      const updated = await client.query<{ token_expires_at: Date }>(
        `UPDATE marketplace_connections SET
           access_token_enc = $2, refresh_token_enc = $3,
           token_expires_at = now() + make_interval(secs => $4), last_error = NULL, updated_at = now()
         WHERE id = $1 RETURNING token_expires_at`,
        [row.id, encryptToken(next.accessToken), next.refreshToken ? encryptToken(next.refreshToken) : row.refresh_token_enc, next.expiresIn],
      )
      return {
        id: row.id,
        marketplaceId: mpId,
        externalAccountId: row.external_account_id,
        accessToken: next.accessToken,
        expiresAt: updated.rows[0].token_expires_at,
      }
    } catch (error) {
      await client.query(
        `UPDATE marketplace_connections SET status='expired', last_error=$2, updated_at=now() WHERE id=$1`,
        [row.id, (error as Error).message.slice(0, 500)],
      )
      return null
    }
  })
}

export async function markConnectionError(connectionId: string, message: string) {
  await pool.query(`UPDATE marketplace_connections SET last_error=$2, updated_at=now() WHERE id=$1`, [
    connectionId,
    message.slice(0, 500),
  ])
}

export async function disconnect(code: string) {
  const mpId = await marketplaceId(code)
  await pool.query(
    `UPDATE marketplace_connections
        SET status='not_connected', access_token_enc=NULL, refresh_token_enc=NULL, token_expires_at=NULL, updated_at=now()
      WHERE marketplace_id = $1 AND status <> 'not_connected'`,
    [mpId],
  )
}

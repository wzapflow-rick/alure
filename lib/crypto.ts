import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// OAuth tokens from marketplaces are stored encrypted (AES-256-GCM).
// TOKEN_ENCRYPTION_KEY must be a long random secret kept only on the server.
function key() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY
  if (!secret || secret.length < 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY ausente ou curta (mínimo 32 caracteres).')
  }
  return createHash('sha256').update(secret).digest()
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join('.')
}

export function decryptToken(payload: string) {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Token criptografado inválido.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

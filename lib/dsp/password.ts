import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>
// N=16384, r=16 needs 32 MiB, which equals Node's default maxmem and gets rejected.
const PARAMS = { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LEN = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, PARAMS)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, keyHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltHex, 'hex'), expected.length, PARAMS)
  return key.length === expected.length && timingSafeEqual(key, expected)
}

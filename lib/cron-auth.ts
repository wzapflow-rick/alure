import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/** Accepts `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or `?key=<CRON_SECRET>` (external schedulers). */
export function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const key = request.nextUrl.searchParams.get('key')
  const candidate = key ? key : header.replace(/^Bearer\s+/i, '')
  const expected = Buffer.from(secret)
  const received = Buffer.from(candidate)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

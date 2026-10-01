import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export type SessionUser = { id: string; email: string; name: string }

// Deduplicated per request: layout and page share one session lookup.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return { id: session.user.id, email: session.user.email, name: session.user.name }
})

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/entrar')
  return user
}

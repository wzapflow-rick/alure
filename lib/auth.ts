import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { pool } from '@/lib/db'
import { authRateLimitStorage } from '@/lib/auth-rate-limit'

function allowedEmails() {
  return (process.env.ALURE_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 10,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const allowed = allowedEmails()
          if (allowed.length > 0) {
            if (!allowed.includes(user.email.toLowerCase())) {
              throw new APIError('FORBIDDEN', { message: 'Cadastro não autorizado.' })
            }
            return { data: user }
          }
          // Without an allowlist only the very first account may be created; afterwards sign-up is closed.
          const { rows } = await pool.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM "user") AS exists`)
          if (rows[0]?.exists) {
            throw new APIError('FORBIDDEN', { message: 'Cadastro fechado. Peça acesso ao administrador.' })
          }
          return { data: user }
        },
      },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production',
    window: 60,
    max: 100,
    customStorage: authRateLimitStorage,
    customRules: {
      '/sign-in/email': { window: 15 * 60, max: 10 },
      '/sign-up/email': { window: 60 * 60, max: 5 },
      '/change-password': { window: 15 * 60, max: 5 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Signed session cookie avoids a database round trip on every navigation.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          // Required by the cross-site v0 preview iframe. Without these
          // attributes, login succeeds but the next request appears signed out.
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})

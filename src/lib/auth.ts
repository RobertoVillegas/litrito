import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getDatabase } from '#/db/client'
import * as schema from '#/db/schema'
import { sendPasswordResetEmail } from '#/features/auth/infrastructure/password-reset-email'

const enabled = (id?: string, secret?: string) => Boolean(id && secret)

export function createAuth() {
  const { db } = getDatabase()
  const google = enabled(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  const facebook = enabled(process.env.FACEBOOK_CLIENT_ID, process.env.FACEBOOK_CLIENT_SECRET)

  return betterAuth({
    appName: 'Litrito',
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.SITE_URL ?? 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: ({ user, url }) => sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
      }),
      resetPasswordTokenExpiresIn: 60 * 60,
    },
    socialProviders: {
      ...(google ? { google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      } } : {}),
      ...(facebook ? { facebook: {
        clientId: process.env.FACEBOOK_CLIENT_ID as string,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string,
      } } : {}),
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/forget-password': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
      },
    },
    // Traefik owns the public edge and overwrites this single-value header.
    // The web container is only exposed on the private Dokploy network.
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    trustedOrigins: [process.env.BETTER_AUTH_URL ?? process.env.SITE_URL ?? 'http://localhost:3000'],
    plugins: [tanstackStartCookies()],
  })
}

export function socialProvidersEnabled() {
  return {
    google: enabled(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
    facebook: enabled(process.env.FACEBOOK_CLIENT_ID, process.env.FACEBOOK_CLIENT_SECRET),
  }
}

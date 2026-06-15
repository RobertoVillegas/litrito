import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import { betterAuth } from 'better-auth/minimal'
import { query } from './_generated/server'
import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'
import { PASSWORD_RESET_EXPIRES_IN_SECONDS } from './email/config'

declare const process: {
  env: {
    SITE_URL?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    FACEBOOK_CLIENT_ID?: string
    FACEBOOK_CLIENT_SECRET?: string
  }
}

// Social logins are opt-in: each provider only turns on when both of its
// credentials are present in the Convex deployment env. Missing vars must never
// break auth startup, so we never assert these with `!`.
const googleEnabled = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

const facebookEnabled = (): boolean =>
  Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET)

export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const socialProviders = {
    ...(googleEnabled()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : {}),
    ...(facebookEnabled()
      ? {
          facebook: {
            clientId: process.env.FACEBOOK_CLIENT_ID as string,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string,
          },
        }
      : {}),
  }

  return betterAuth({
    baseURL: process.env.SITE_URL ?? 'http://localhost:3000',
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        const actionCtx = requireActionCtx(ctx)
        await actionCtx.runAction(internal.email.sendPasswordResetEmail.send, {
          resetUrl: url,
          userEmail: user.email,
          userName: user.name,
        })
      },
      resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRES_IN_SECONDS,
    },
    socialProviders,
    // Persist counters in the component's `rateLimit` table — Convex functions
    // are stateless, so the default in-memory store would never accumulate.
    // Limits are per client IP (forwarded via x-forwarded-for through the proxy).
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
    trustedOrigins: [process.env.SITE_URL ?? 'http://localhost:3000'],
    plugins: [convex({ authConfig })],
  })
}

export const { getAuthUser } = authComponent.clientApi()

// Lets the client decide which social login buttons to show so they never
// appear for providers that aren't configured on the backend.
export const socialProvidersEnabled = query({
  args: {},
  handler: async () => ({
    google: googleEnabled(),
    facebook: facebookEnabled(),
  }),
})

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx)
  },
})

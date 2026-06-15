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
  }
}

// Google social login is opt-in: it only turns on when both credentials are
// present in the Convex deployment env. Missing vars must never break auth
// startup, so we never assert these with `!`.
const googleEnabled = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const socialProviders = googleEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {}

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
    trustedOrigins: [process.env.SITE_URL ?? 'http://localhost:3000'],
    plugins: [convex({ authConfig })],
  })
}

export const { getAuthUser } = authComponent.clientApi()

// Lets the client decide whether to show the "Continuar con Google" button so
// it never appears when the provider isn't configured on the backend.
export const isGoogleEnabled = query({
  args: {},
  handler: async () => googleEnabled(),
})

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx)
  },
})

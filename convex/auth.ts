import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth/minimal'
import { query } from './_generated/server'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'

declare const process: {
  env: {
    SITE_URL?: string
  }
}

export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: [process.env.SITE_URL ?? 'http://localhost:3000'],
    plugins: [convex({ authConfig })],
  })
}

export const { getAuthUser } = authComponent.clientApi()

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx)
  },
})

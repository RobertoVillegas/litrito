import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { createAuth, socialProvidersEnabled } from './auth'

let authInstance: ReturnType<typeof createAuth> | undefined

export const getAuth = createServerOnlyFn(() => {
  authInstance ??= createAuth()
  return authInstance
})

export const handler = createServerOnlyFn((request: Request) =>
  getAuth().handler(request))

export const getSocialProviders = createServerFn({ method: 'GET' }).handler(
  () => socialProvidersEnabled(),
)

import { createServerFn } from '@tanstack/react-start'
import { createAuth, socialProvidersEnabled } from './auth'

let authInstance: ReturnType<typeof createAuth> | undefined

export function getAuth() {
  authInstance ??= createAuth()
  return authInstance
}

export const handler = (request: Request) => getAuth().handler(request)

export const getSocialProviders = createServerFn({ method: 'GET' }).handler(
  () => socialProvidersEnabled(),
)

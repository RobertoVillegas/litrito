export function getConfiguredSiteOrigin(): string {
  const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined
  const appDomain =
    runtimeEnv?.APP_DOMAIN ||
    runtimeEnv?.VITE_APP_DOMAIN ||
    (import.meta.env.VITE_APP_DOMAIN as string | undefined) ||
    ''
  if (appDomain) return normalizeSiteOrigin(appDomain)

  if (typeof window !== 'undefined' && window.location.origin) {
    return normalizeSiteOrigin(window.location.origin)
  }

  return ''
}

function normalizeSiteOrigin(origin: string): string {
  const withProtocol = origin.startsWith('http') ? origin : `https://${origin}`
  return withProtocol.replace(/\/+$/, '')
}

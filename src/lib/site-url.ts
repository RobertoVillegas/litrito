export function getConfiguredSiteOrigin(): string {
  const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined
  const appDomain =
    runtimeEnv?.APP_DOMAIN ||
    runtimeEnv?.VITE_APP_DOMAIN ||
    (import.meta.env.VITE_APP_DOMAIN as string | undefined) ||
    ''
  if (!appDomain) return ''
  return appDomain.startsWith('http') ? appDomain : `https://${appDomain}`
}

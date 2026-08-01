import { createFileRoute } from '@tanstack/react-router'
import { getSitemapLocations } from '#/features/public-data/transport/server-functions'

let cachedLocationPaths: string[] | null = null

function siteOrigin(request: Request) {
  const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined
  const appDomain =
    runtimeEnv?.APP_DOMAIN ||
    runtimeEnv?.VITE_APP_DOMAIN ||
    (import.meta.env.VITE_APP_DOMAIN as string | undefined)
  if (appDomain) {
    return appDomain.startsWith('http') ? appDomain : `https://${appDomain}`
  }
  return new URL(request.url).origin
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = siteOrigin(request)
        const urls = [
          '/',
          '/explorar',
          '/metricas',
          '/privacidad',
          '/terminos',
          '/eliminar-datos',
        ]

        try {
            const locations = await getSitemapLocations()
            const stateSlugById = new Map(
              locations.states.map((state) => [state.externalId, state.slug]),
            )
            const locationPaths: string[] = []
            for (const state of locations.states) {
              locationPaths.push(`/estado/${state.slug}`)
            }
            for (const municipality of locations.municipalities) {
              const stateSlug = stateSlugById.get(municipality.stateExternalId)
              if (stateSlug) {
                locationPaths.push(`/estado/${stateSlug}/${municipality.slug}`)
              }
            }
            cachedLocationPaths = locationPaths
        } catch (error) {
          console.error('sitemap_location_fetch_failed', {
            message: error instanceof Error ? error.message : String(error),
          })
        }
        if (cachedLocationPaths) urls.push(...cachedLocationPaths)

        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map(
            (path) =>
              `  <url><loc>${escapeXml(`${origin}${path}`)}</loc><changefreq>daily</changefreq></url>`,
          )
          .join('\n')}\n</urlset>\n`

        return new Response(body, {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})

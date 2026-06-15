import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { LocationSeoPage } from '../components/LocationSeoPage'
import { RouteErrorFallback } from '../components/RouteError'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { buildLocationJsonLd, buildSeoMeta } from '../lib/seo'

export const Route = createFileRoute('/estado/$stateSlug')({
  loader: async ({ context, params }) => {
    return await context.queryClient.ensureQueryData(
      context.convexQueryClient.queryOptions(api.stations.seoLocationOverview, {
        stateSlug: params.stateSlug,
      }),
    )
  },
  head: ({ loaderData, params }) => {
    const data = loaderData
    const title = data
      ? `Gasolina en ${data.state.name} - precios promedio | Litrito`
      : `Gasolina por estado - ${params.stateSlug} | Litrito`
    const description = data
      ? `Consulta precios promedio de gasolina regular, premium y diesel en ${data.state.name}, top de estaciones baratas y municipios disponibles.`
      : 'Consulta precios de gasolina por estado en Litrito.'
    const path = data ? `/estado/${data.state.slug}` : `/estado/${params.stateSlug}`
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}${path}` : path
    const jsonLd = data
      ? buildLocationJsonLd({ placeName: data.state.name, url, topRegular: data.topRegular })
      : null
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: data ? `Gasolina en ${data.state.name}.` : 'Gasolina por estado.',
          subtitle: data
            ? 'Precios promedio, estaciones baratas y municipios disponibles.'
            : 'Consulta precios de gasolina por estado en Litrito.',
        },
        url,
      }),
      links: [{ rel: 'canonical', href: url }],
      ...(jsonLd
        ? { scripts: [{ type: 'application/ld+json', children: JSON.stringify(jsonLd) }] }
        : {}),
    }
  },
  component: StatePage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="state-seo"
      context={{ route: '/estado/$stateSlug' }}
    />
  ),
})

function StatePage() {
  const data = Route.useLoaderData()
  if (!data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
        <h1 className="font-display text-4xl text-ink">Estado no encontrado</h1>
        <p className="mt-3 text-sm font-semibold text-body">
          Revisa el enlace o explora el catálogo completo de estaciones.
        </p>
        <Button render={<a href="/explorar" />} className="mt-6">
          Explorar estaciones
        </Button>
      </main>
    )
  }
  return <LocationSeoPage data={data} />
}

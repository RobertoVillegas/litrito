import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { LocationSeoPage } from '../components/LocationSeoPage'
import { RouteErrorFallback } from '../components/RouteError'
import { getConfiguredSiteOrigin } from '../lib/site-url'

export const Route = createFileRoute('/estado/$stateSlug_/$municipalitySlug')({
  loader: async ({ context, params }) => {
    return await context.queryClient.ensureQueryData(
      context.convexQueryClient.queryOptions(api.stations.seoLocationOverview, {
        stateSlug: params.stateSlug,
        municipalitySlug: params.municipalitySlug,
      }),
    )
  },
  head: ({ loaderData, params }) => {
    const data = loaderData
    const place = data?.municipality
      ? `${data.municipality.name}, ${data.state.name}`
      : params.municipalitySlug
    const title = `Gasolina en ${place} - precios promedio | Litrito`
    const description = data?.municipality
      ? `Consulta precios promedio de gasolina en ${data.municipality.name}, ${data.state.name}, top de estaciones baratas y métricas por combustible.`
      : 'Consulta precios de gasolina por municipio en Litrito.'
    const path =
      data?.municipality
        ? `/estado/${data.state.slug}/${data.municipality.slug}`
        : `/estado/${params.stateSlug}/${params.municipalitySlug}`
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}${path}` : path
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: MunicipalityPage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="municipality-seo"
      context={{ route: '/estado/$stateSlug/$municipalitySlug' }}
    />
  ),
})

function MunicipalityPage() {
  const data = Route.useLoaderData()
  if (!data) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-16">
        <h1 className="font-display text-4xl text-ink">Municipio no encontrado</h1>
        <p className="mt-3 text-sm font-semibold text-body">
          Revisa el enlace o explora el catálogo completo de estaciones.
        </p>
        <a href="/explorar" className="btn-pill btn-pill--primary mt-6">
          Explorar estaciones
        </a>
      </main>
    )
  }
  return <LocationSeoPage data={data} />
}

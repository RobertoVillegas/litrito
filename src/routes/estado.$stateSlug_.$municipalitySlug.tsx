import { createFileRoute, notFound } from '@tanstack/react-router'
import { publicQueryOptions } from '#/features/public-data/react/query-options'
import { Button } from '#/components/ui/button'
import { LocationSeoPage } from '../components/LocationSeoPage'
import { RouteErrorFallback } from '../components/RouteError'
import { getConfiguredSiteOrigin } from '../lib/site-url'
import { buildBreadcrumbJsonLd, buildLocationJsonLd, buildSeoMeta } from '../lib/seo'

export const Route = createFileRoute('/estado/$stateSlug_/$municipalitySlug')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      publicQueryOptions.seoLocation({
        stateSlug: params.stateSlug,
        municipalitySlug: params.municipalitySlug,
      }),
    )
    // Unknown state/municipality slug → real 404, not a 200 shell.
    if (!data) throw notFound()
    return data
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
    const jsonLd = data?.municipality
      ? buildLocationJsonLd({
          placeName: `${data.municipality.name}, ${data.state.name}`,
          url,
          topRegular: data.topRegular,
        })
      : null
    const breadcrumbJsonLd = data?.municipality
      ? buildBreadcrumbJsonLd({
          items: [
            { name: 'Litrito', url: origin || '/' },
            {
              name: data.state.name,
              url: origin ? `${origin}/estado/${data.state.slug}` : `/estado/${data.state.slug}`,
            },
            { name: data.municipality.name, url },
          ],
        })
      : null
    const scripts = [jsonLd, breadcrumbJsonLd].flatMap((item) =>
      item ? [{ type: 'application/ld+json', children: JSON.stringify(item) }] : [],
    )
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: `Gasolina en ${place}.`,
          subtitle: data?.municipality
            ? 'Precios promedio, estaciones baratas y métricas por combustible.'
            : 'Consulta precios de gasolina por municipio en Litrito.',
        },
        url,
      }),
      links: [{ rel: 'canonical', href: url }],
      ...(scripts.length ? { scripts } : {}),
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
        <Button render={<a href="/explorar" />} className="mt-6">
          Explorar estaciones
        </Button>
      </main>
    )
  }
  return <LocationSeoPage data={data} />
}

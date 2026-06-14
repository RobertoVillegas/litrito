import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import ConvexProvider from '../integrations/convex/provider'
import { PromoMarquee } from '../components/PromoMarquee'
import { ServiceWorkerRegistration } from '../components/ServiceWorkerRegistration'
import { SiteNav } from '../components/SiteNav'
import { ToastProvider } from '../components/ui/toast'
import { UserLocationProvider } from '../lib/useUserLocation'
import { getConfiguredSiteOrigin } from '../lib/site-url'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'

interface MyRouterContext {
  convexQueryClient: ConvexQueryClient
  queryClient: QueryClient
}

const OG_IMAGE_VERSION = '2026-06-13'

// Read the Umami config from the SERVER runtime env (not import.meta.env, which
// Vite inlines at build time — that fails when the value is only present in the
// container's runtime .env). The loader runs on the server and its result is
// dehydrated to the client, so `head()` produces the same <script> on both
// sides with no hydration mismatch. Do NOT reuse another site's website id.
export const Route = createRootRouteWithContext<MyRouterContext>()({
  loader: () => {
    // Read from both sources so it works regardless of how the deploy supplies
    // it: import.meta.env (inlined at Vite build, like VITE_CONVEX_URL) and the
    // server's runtime process.env (docker-compose / Dokploy .env).
    const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined
    const umamiWebsiteId =
      (import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined) ||
      runtimeEnv?.VITE_UMAMI_WEBSITE_ID ||
      ''
    const umamiSrc =
      (import.meta.env.VITE_UMAMI_SRC as string | undefined) ||
      runtimeEnv?.VITE_UMAMI_SRC ||
      'https://umami.athas.mx/script.js'
    const appOrigin = getConfiguredSiteOrigin()
    const ogImage = appOrigin
      ? `${appOrigin}/og-image.png?v=${OG_IMAGE_VERSION}`
      : `/og-image.png?v=${OG_IMAGE_VERSION}`
    return { umamiWebsiteId, umamiSrc, appOrigin, ogImage }
  },
  head: ({ loaderData }) => ({
    scripts: loaderData?.umamiWebsiteId
      ? [
          {
            src: loaderData.umamiSrc,
            defer: true,
            'data-website-id': loaderData.umamiWebsiteId,
          },
        ]
      : [],
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        name: 'theme-color',
        content: '#25282b',
      },
      {
        name: 'mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'Litrito',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'black-translucent',
      },
      {
        title: 'Litrito - precios de gasolina en Mexico',
      },
      {
        name: 'description',
        content:
          'Compara precios de gasolina por estacion, municipio y estado en Mexico. Regular, premium, diesel y duba, actualizados a diario.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: 'Litrito',
      },
      {
        property: 'og:title',
        content: 'Litrito - precios de gasolina en Mexico',
      },
      {
        property: 'og:description',
        content:
          'Compara precios de gasolina por estacion, municipio y estado en Mexico.',
      },
      {
        property: 'og:image',
        content: loaderData?.ogImage ?? '/og-image.png',
      },
      {
        property: 'og:image:url',
        content: loaderData?.ogImage ?? '/og-image.png',
      },
      {
        property: 'og:image:secure_url',
        content: loaderData?.ogImage ?? '/og-image.png',
      },
      {
        property: 'og:image:type',
        content: 'image/png',
      },
      {
        property: 'og:image:width',
        content: '1200',
      },
      {
        property: 'og:image:height',
        content: '630',
      },
      {
        property: 'og:image:alt',
        content: 'Litrito - precios de gasolina en Mexico',
      },
      {
        property: 'og:locale',
        content: 'es_MX',
      },
      ...(loaderData?.appOrigin
        ? [
            {
              property: 'og:url',
              content: loaderData.appOrigin,
            },
          ]
        : []),
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'Litrito - precios de gasolina en Mexico',
      },
      {
        name: 'twitter:description',
        content:
          'Compara precios de gasolina por estacion, municipio y estado en Mexico.',
      },
      {
        name: 'twitter:image',
        content: loaderData?.ogImage ?? '/og-image.png',
      },
      {
        name: 'twitter:image:alt',
        content: 'Litrito - precios de gasolina en Mexico',
      },
      {
        name: 'twitter:image:type',
        content: 'image/png',
      },
      {
        name: 'twitter:image:width',
        content: '1200',
      },
      {
        name: 'twitter:image:height',
        content: '630',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        href: '/favicon.ico',
        sizes: 'any',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        404
      </p>
      <h1 className="font-display text-4xl text-ink">Página no encontrada</h1>
      <p className="max-w-md text-sm font-semibold leading-6 text-body">
        La ruta que abriste no existe o cambió. Puedes volver al inicio o
        explorar estaciones por estado, municipio o nombre.
      </p>
      <a
        href="/"
        className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-bold text-white transition hover:bg-ink/90"
      >
        Ir al inicio
      </a>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexProvider>
          <ToastProvider>
            <UserLocationProvider>
              <ServiceWorkerRegistration />
              <PromoMarquee />
              <SiteNav />
              {children}
            </UserLocationProvider>
          </ToastProvider>
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        </ConvexProvider>
        <Scripts />
      </body>
    </html>
  )
}

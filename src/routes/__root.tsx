import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import ConvexProvider from '../integrations/convex/provider'
import { PromoMarquee } from '../components/PromoMarquee'
import { SiteNav } from '../components/SiteNav'
import { UserLocationProvider } from '../lib/useUserLocation'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'

interface MyRouterContext {
  convexQueryClient: ConvexQueryClient
  queryClient: QueryClient
}

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
    return { umamiWebsiteId, umamiSrc }
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
        content: '/og-image.png',
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
        content: '/og-image.png',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛽</text></svg>",
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexProvider>
          <UserLocationProvider>
            <PromoMarquee />
            <SiteNav />
            {children}
          </UserLocationProvider>
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

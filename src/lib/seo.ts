import { getConfiguredSiteOrigin } from './site-url'

type OgImageInput = {
  title: string
  subtitle?: string
  eyebrow?: string
  badges?: string[]
}

type SeoInput = {
  title: string
  description: string
  image?: OgImageInput
  url?: string
}

export function buildOgImageUrl({
  title,
  subtitle,
  eyebrow = 'Litrito',
  badges = [],
}: OgImageInput) {
  const params = new URLSearchParams({ title, eyebrow })
  if (subtitle) params.set('subtitle', subtitle)
  for (const badge of badges) {
    if (badge.trim()) params.append('badge', badge)
  }
  const path = `/og.png?${params.toString()}`
  const origin = getConfiguredSiteOrigin()
  return origin ? `${origin}${path}` : path
}

type LocationJsonLdInput = {
  placeName: string
  url?: string
  topRegular: {
    station: {
      name: string
      address: string
      municipalityName?: string
      stateName?: string
    }
    price: number
  }[]
}

type BreadcrumbJsonLdInput = {
  items: {
    name: string
    url: string
  }[]
}

// ItemList of the cheapest regular-gas stations for a location page, so search
// engines can surface the list (mirrors the GasStation JSON-LD on detail pages).
export function buildLocationJsonLd({ placeName, url, topRegular }: LocationJsonLdInput) {
  if (!topRegular.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Gasolineras más baratas en ${placeName}`,
    ...(url ? { url } : {}),
    numberOfItems: topRegular.length,
    itemListElement: topRegular.map((row, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'GasStation',
        name: row.station.name,
        address: {
          '@type': 'PostalAddress',
          streetAddress: row.station.address,
          addressLocality: row.station.municipalityName,
          addressRegion: row.station.stateName,
          addressCountry: 'MX',
        },
        makesOffer: {
          '@type': 'Offer',
          name: 'Gasolina regular',
          price: row.price,
          priceCurrency: 'MXN',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: row.price,
            priceCurrency: 'MXN',
            unitText: 'litro',
          },
        },
      },
    })),
  }
}

export function buildBreadcrumbJsonLd({ items }: BreadcrumbJsonLdInput) {
  if (!items.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function buildSeoMeta({ title, description, image, url }: SeoInput) {
  const imageUrl = buildOgImageUrl({
    title,
    subtitle: image?.subtitle ?? description,
    eyebrow: image?.eyebrow,
    badges: image?.badges,
  })

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:url', content: imageUrl },
    { property: 'og:image:secure_url', content: imageUrl },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: title },
    ...(url ? [{ property: 'og:url', content: url }] : []),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: imageUrl },
    { name: 'twitter:image:alt', content: title },
    { name: 'twitter:image:type', content: 'image/png' },
    { name: 'twitter:image:width', content: '1200' },
    { name: 'twitter:image:height', content: '630' },
  ]
}

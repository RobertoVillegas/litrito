import { getConfiguredSiteOrigin } from './site-url'

type OgImageInput = {
  title: string
  subtitle?: string
  eyebrow?: string
}

type SeoInput = {
  title: string
  description: string
  image?: OgImageInput
  url?: string
}

export function buildOgImageUrl({ title, subtitle, eyebrow = 'Litrito' }: OgImageInput) {
  const params = new URLSearchParams({ title, eyebrow })
  if (subtitle) params.set('subtitle', subtitle)
  const path = `/og.png?${params.toString()}`
  const origin = getConfiguredSiteOrigin()
  return origin ? `${origin}${path}` : path
}

export function buildSeoMeta({ title, description, image, url }: SeoInput) {
  const imageUrl = buildOgImageUrl({
    title,
    subtitle: image?.subtitle ?? description,
    eyebrow: image?.eyebrow,
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

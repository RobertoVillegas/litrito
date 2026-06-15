#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outPath = join(root, 'public', 'sitemap.xml')

const CONVEX_URL = process.env.VITE_CONVEX_URL || 'https://litrito-convex.litrito.com'
const rawDomain = process.env.APP_DOMAIN || process.env.VITE_APP_DOMAIN || 'litrito.com'
const SITE = (rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`).replace(/\/+$/, '')

// Must match src/lib/slug.ts so the URLs resolve to the same routes.
function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const STATIC_PATHS = ['/', '/explorar', '/metricas', '/privacidad', '/terminos']

async function collectLocationPaths() {
  const client = new ConvexHttpClient(CONVEX_URL)
  const states = await client.query(anyApi.catalog.states, {})
  const paths = []
  for (const state of states) {
    const stateSlug = slugify(state.name)
    paths.push(`/estado/${stateSlug}`)
    const municipalities = await client.query(anyApi.catalog.municipalities, {
      stateExternalId: state.externalId,
    })
    for (const municipality of municipalities) {
      paths.push(`/estado/${stateSlug}/${slugify(municipality.name)}`)
    }
  }
  return paths
}

function renderXml(paths) {
  const today = new Date().toISOString().slice(0, 10)
  const body = paths
    .map(
      (p) =>
        `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

const main = async () => {
  let paths = [...STATIC_PATHS]
  try {
    const locationPaths = await collectLocationPaths()
    paths = [...STATIC_PATHS, ...locationPaths]
    console.log(`Sitemap: ${paths.length} URLs (${locationPaths.length} location pages)`)
  } catch (err) {
    // Never fail the build over the sitemap — ship a minimal valid one.
    console.warn(
      `Sitemap: could not reach Convex at ${CONVEX_URL} (${err.message}); ` +
        `writing minimal sitemap with ${STATIC_PATHS.length} URLs`,
    )
  }
  await writeFile(outPath, renderXml(paths))
  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

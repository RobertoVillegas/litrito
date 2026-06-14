#!/usr/bin/env node
// Preview the NEW station OG design (vertical centering, dynamic title size,
// address + city/state subtitle). Generates PNGs under public/og-preview/.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'og-preview')
const logoPath = join(root, 'public', 'litrito-logo-full-res.png')
const fontPath = join(root, 'public', 'fonts', 'inter-latin-700-normal.woff')

const FONT_FAMILY = 'Inter'
const OG_SIZE = { width: 1200, height: 630 }

function ogTitleFontSize(title) {
  const n = title.length
  if (n <= 22) return 72
  if (n <= 34) return 60
  if (n <= 48) return 52
  return 44
}

function makeMarkup({ eyebrow, title, subtitle, badges, logoSrc }) {
  const titleSize = ogTitleFontSize(title)
  return {
    type: 'div',
    props: {
      style: {
        background: '#ffffff',
        color: '#25282b',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: `"${FONT_FAMILY}", sans-serif`,
        height: '100%',
        justifyContent: 'space-between',
        padding: '64px 72px',
        position: 'relative',
        width: '100%',
      },
      children: [
        // left red bar
        {
          type: 'div',
          props: {
            style: {
              background: '#e60000',
              display: 'flex',
              height: '100%',
              left: '0',
              position: 'absolute',
              top: '0',
              width: '18px',
            },
          },
        },
        // right dark bar
        {
          type: 'div',
          props: {
            style: {
              background: '#25282b',
              display: 'flex',
              height: '100%',
              position: 'absolute',
              right: '0',
              top: '0',
              width: '18px',
            },
          },
        },
        // top band: eyebrow (logo + label)
        {
          type: 'div',
          props: {
            style: {
              alignItems: 'center',
              color: '#e60000',
              display: 'flex',
              flexShrink: 0,
              fontSize: '30px',
              fontWeight: 700,
              gap: '16px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: logoSrc,
                  style: { display: 'flex', height: '68px', objectFit: 'contain', width: '68px' },
                },
              },
              { type: 'span', props: { children: eyebrow } },
            ],
          },
        },
        // middle band: title + subtitle, vertically centered
        {
          type: 'div',
          props: {
            style: {
              alignItems: 'flex-start',
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1,
              justifyContent: 'center',
              padding: '24px 0',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontSize: `${titleSize}px`,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.04,
                    maxWidth: '980px',
                  },
                  children: title,
                },
              },
              subtitle
                ? {
                    type: 'div',
                    props: {
                      style: {
                        color: '#3a3e42',
                        display: 'flex',
                        fontSize: '28px',
                        fontWeight: 700,
                        lineHeight: 1.3,
                        marginTop: '24px',
                        maxWidth: '880px',
                        whiteSpace: 'pre-wrap',
                      },
                      children: subtitle,
                    },
                  }
                : null,
            ],
          },
        },
        // bottom band: price badges (always present to keep middle centered)
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              flexShrink: 0,
              gap: '14px',
              minHeight: '64px',
            },
            children: badges.map((badge) => ({
              type: 'div',
              props: {
                style: {
                  alignItems: 'center',
                  background: '#25282b',
                  borderRadius: '10px',
                  color: '#ffffff',
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '12px',
                  padding: '14px 18px',
                },
                children: [
                  {
                    type: 'span',
                    props: {
                      style: { color: '#ffffff', display: 'flex', fontSize: '22px', fontWeight: 700 },
                      children: badge.label,
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: { color: '#facc15', display: 'flex', fontSize: '26px', fontWeight: 700 },
                      children: badge.detail,
                    },
                  },
                ],
              },
            })),
          },
        },
      ],
    },
  }
}

async function render(sample, font, logoSrc) {
  const svg = await satori(makeMarkup({ ...sample, logoSrc }), {
    ...OG_SIZE,
    fonts: [{ data: font, name: FONT_FAMILY, style: 'normal', weight: 700 }],
  })
  return new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'width', value: OG_SIZE.width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng()
}

const samples = [
  {
    file: 'station-cv.png',
    eyebrow: 'Litrito estación',
    title: 'SERVICIO VALOR S.A. DE C.V.',
    subtitle: 'Blvd. Adolfo López Mateos 1500\nVictoria, Tamaulipas',
    badges: [
      { label: 'Regular', detail: '$23.49' },
      { label: 'Premium', detail: '$24.80' },
    ],
  },
  {
    file: 'station-short.png',
    eyebrow: 'Litrito estación',
    title: 'PEMEX 1234',
    subtitle: 'Av. Insurgentes Sur 1602\nBenito Juárez, Ciudad de México',
    badges: [
      { label: 'Regular', detail: '$22.99' },
      { label: 'Premium', detail: '$24.50' },
      { label: 'Diésel', detail: '$24.10' },
    ],
  },
  {
    file: 'station-long.png',
    eyebrow: 'Litrito estación',
    title: 'GASOLINERA Y SERVICIOS LA ESPERANZA DEL NORTE S.A. DE C.V.',
    subtitle: 'Carretera Nacional México-Laredo Km 42.5\nSanta Catarina, Nuevo León',
    badges: [
      { label: 'Regular', detail: '$23.10' },
      { label: 'Premium', detail: '$25.30' },
      { label: 'Diésel', detail: '$24.95' },
    ],
  },
  {
    file: 'station-no-address.png',
    eyebrow: 'Litrito estación',
    title: 'COMBUSTIBLES DEL BAJÍO',
    subtitle: 'León, Guanajuato',
    badges: [{ label: 'Regular', detail: '$22.80' }],
  },
]

const run = async () => {
  await mkdir(outDir, { recursive: true })
  const [font, logo] = await Promise.all([readFile(fontPath), readFile(logoPath)])
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`
  for (const sample of samples) {
    const png = await render(sample, font, logoSrc)
    await writeFile(join(outDir, sample.file), png)
    console.log(`Wrote ${join('public', 'og-preview', sample.file)} (${png.length} bytes)`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

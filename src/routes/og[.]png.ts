import { createFileRoute } from '@tanstack/react-router'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

const OG_SIZE = { width: 1200, height: 630 }
const FONT_FAMILY = 'Inter'
const FONT_WEIGHT = 700
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))

let assetsPromise:
  | Promise<{
      font: Buffer
      logoSrc: string
    }>
  | undefined

async function loadAssets() {
  const readPublicAsset = async (path: string) => {
    const candidates = [
      join(process.cwd(), 'public', path),
      join(process.cwd(), '.output', 'public', path),
      join(CURRENT_DIR, '..', '..', 'public', path),
      join(CURRENT_DIR, '..', '..', '..', 'public', path),
    ]

    let lastError: unknown
    for (const candidate of candidates) {
      try {
        return await readFile(candidate)
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  }

  assetsPromise ??= Promise.all([
    readPublicAsset(`fonts/inter-latin-${FONT_WEIGHT}-normal.woff`),
    readPublicAsset('litrito-logo-full-res.png'),
  ]).then(([font, logo]) => ({
    font,
    logoSrc: `data:image/png;base64,${logo.toString('base64')}`,
  }))
  return assetsPromise
}

function cleanText(value: string | null, fallback: string, maxLength: number) {
  const text = (value ?? '')
    .trim()
    .split(/\n+/)
    .map((line) => line.trim().replace(/[^\S\n]+/g, ' '))
    .filter(Boolean)
    .join('\n')
  return (text || fallback).slice(0, maxLength)
}

function ogTitleFontSize(title: string) {
  const n = title.length
  if (n <= 22) return 72
  if (n <= 34) return 60
  if (n <= 48) return 52
  return 44
}

function cleanBadges(values: string[]) {
  return values
    .map((value) => {
      const [label = '', detail = ''] = value.split('|')
      const cleanLabel = cleanText(label, '', 28)
      const cleanDetail = cleanText(detail, '', 18)
      if (!cleanLabel || !cleanDetail) return null
      return { label: cleanLabel, detail: cleanDetail }
    })
    .filter((value): value is { label: string; detail: string } => Boolean(value))
    .slice(0, 4)
}

async function renderOgImage({
  title,
  subtitle,
  eyebrow,
  badges,
}: {
  title: string
  subtitle: string
  eyebrow: string
  badges: Array<{ label: string; detail: string }>
}) {
  const { font, logoSrc } = await loadAssets()
  const titleSize = ogTitleFontSize(title)
  const markup = {
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
        {
          type: 'div',
          props: {
            style: {
              alignItems: 'center',
              display: 'flex',
              flexShrink: 0,
              justifyContent: 'space-between',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    alignItems: 'center',
                    color: '#e60000',
                    display: 'flex',
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
                        style: {
                          display: 'flex',
                          height: '68px',
                          objectFit: 'contain',
                          width: '68px',
                        },
                      },
                    },
                    { type: 'span', props: { children: eyebrow } },
                  ],
                },
              },
              {
                type: 'span',
                props: {
                  style: {
                    color: '#7e7e7e',
                    display: 'flex',
                    fontSize: '22px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  },
                  children: 'Hecho por Athas',
                },
              },
            ],
          },
        },
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
              textAlign: 'left',
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
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              flexShrink: 0,
              gap: '14px',
              minHeight: badges.length ? '64px' : '0px',
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
                      style: {
                        color: '#ffffff',
                        display: 'flex',
                        fontSize: '22px',
                        fontWeight: 700,
                      },
                      children: badge.label,
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: {
                        color: '#facc15',
                        display: 'flex',
                        fontSize: '26px',
                        fontWeight: 700,
                      },
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

  const svg = await satori(markup as any, {
    ...OG_SIZE,
    fonts: [
      {
        data: font,
        name: FONT_FAMILY,
        style: 'normal',
        weight: FONT_WEIGHT,
      },
    ],
  })

  return new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'width', value: OG_SIZE.width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng()
}

export const Route = createFileRoute('/og.png')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const title = cleanText(
          url.searchParams.get('title'),
          'Precios de gasolina en México.',
          90,
        )
        const subtitle = cleanText(
          url.searchParams.get('subtitle'),
          'Compara precios por estación, municipio y estado.\nRegular, premium, diésel y duba, actualizados a diario.',
          170,
        )
        const eyebrow = cleanText(url.searchParams.get('eyebrow'), 'Litrito', 34)
        const badges = cleanBadges(url.searchParams.getAll('badge'))
        const png = await renderOgImage({ title, subtitle, eyebrow, badges })

        return new Response(new Uint8Array(png), {
          headers: {
            'content-type': 'image/png',
            'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
          },
        })
      },
    },
  },
})

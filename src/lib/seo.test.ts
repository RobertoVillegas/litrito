import { describe, expect, it } from 'vitest'
import { buildBreadcrumbJsonLd, buildLocationJsonLd } from './seo'

describe('buildLocationJsonLd', () => {
  it('describes gas prices as GasStation offers without nested Product nodes', () => {
    const jsonLd = buildLocationJsonLd({
      placeName: 'Jerez, Zacatecas',
      url: 'https://litrito.com/estado/zacatecas/jerez',
      topRegular: [
        {
          station: {
            name: 'JESUS BORREGO INGUANZO',
            address: 'Calzada Suave Patria No. 53',
            municipalityName: 'Jerez',
            stateName: 'Zacatecas',
          },
          price: 23.99,
        },
      ],
    })

    expect(JSON.stringify(jsonLd)).not.toContain('"@type":"Product"')
    expect(jsonLd).toMatchObject({
      '@type': 'ItemList',
      url: 'https://litrito.com/estado/zacatecas/jerez',
      itemListElement: [
        {
          item: {
            '@type': 'GasStation',
            makesOffer: {
              '@type': 'Offer',
              name: 'Gasolina regular',
              price: 23.99,
              priceCurrency: 'MXN',
            },
          },
        },
      ],
    })
  })
})

describe('buildBreadcrumbJsonLd', () => {
  it('builds a BreadcrumbList from ordered page ancestors', () => {
    expect(
      buildBreadcrumbJsonLd({
        items: [
          { name: 'Litrito', url: 'https://litrito.com' },
          { name: 'Zacatecas', url: 'https://litrito.com/estado/zacatecas' },
          { name: 'Jerez', url: 'https://litrito.com/estado/zacatecas/jerez' },
        ],
      }),
    ).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Litrito', item: 'https://litrito.com' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Zacatecas',
          item: 'https://litrito.com/estado/zacatecas',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Jerez',
          item: 'https://litrito.com/estado/zacatecas/jerez',
        },
      ],
    })
  })
})

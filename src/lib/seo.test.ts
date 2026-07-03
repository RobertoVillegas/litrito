import { describe, expect, it } from 'vitest'
import { buildLocationJsonLd } from './seo'

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

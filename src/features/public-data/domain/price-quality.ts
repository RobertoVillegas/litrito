import type { ListingPrices } from '#/db/schema'

export const MIN_PLAUSIBLE_PRICE = 15
export const MAX_PLAUSIBLE_PRICE = 50

export function isPricePlausible(price: number) {
  return price >= MIN_PLAUSIBLE_PRICE && price <= MAX_PLAUSIBLE_PRICE
}

export function annotatePriceQuality(prices: ListingPrices): ListingPrices {
  return Object.fromEntries(
    Object.entries(prices).map(([fuel, value]) => [
      fuel,
      value ? { ...value, isPlausible: isPricePlausible(value.price) } : value,
    ]),
  ) as ListingPrices
}

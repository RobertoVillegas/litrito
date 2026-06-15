import { v } from 'convex/values'

export const fuelTypeValidator = v.union(
  v.literal('regular'),
  v.literal('premium'),
  v.literal('diesel'),
  v.literal('duba'),
  v.literal('unknown'),
)

export const sortModeValidator = v.union(
  v.literal('price'),
  v.literal('distance'),
  v.literal('name'),
)

export const ingestionRunKindValidator = v.union(
  v.literal('catalog'),
  v.literal('municipality_prices'),
  v.literal('xml_snapshot'),
  v.literal('daily_queue'),
  v.literal('geocoding'),
)

export const runStatusValidator = v.union(
  v.literal('running'),
  v.literal('success'),
  v.literal('failed'),
  v.literal('skipped'),
)

export const adminAuditActionValidator = v.union(
  v.literal('retry_municipality_prices'),
  v.literal('set_user_admin'),
  v.literal('scan_station_brands'),
  v.literal('review_station_brand'),
)

export const adminAuditStatusValidator = v.union(
  v.literal('success'),
  v.literal('failed'),
)

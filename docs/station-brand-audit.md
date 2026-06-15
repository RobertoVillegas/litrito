# Station brand audit

Litrito's CNE source gives one station document per permit number, but the
station `name` is usually the legal name or the permit holder. It is not
reliable as the visible forecourt brand. Examples include `GAZPRO, S.A. DE C.V.`,
`GASISLO 2000 S.A. DE C.V.`, and individual person names.

The brand feature should enrich stations without overwriting the CNE source of
truth. Keep the legal/CNE name intact and store brand evidence separately until
it has been reviewed.

## Current data shape

- `stations`: one row per permit number.
- `fuelPricesCurrent`: one row per station and fuel type.
- The current national export has about 13,720 stations and 13,717 stations with
  coordinates.
- Brand lookup cost must be calculated per station, not per fuel. A station with
  regular, premium, diesel, and duba still needs only one place lookup.

## Implemented module

The first implementation adds `stationBrandAudits` in `convex/schema.ts`.

Important fields:

- `stationPermitNumber`: CNE permit number.
- `stationName`: current CNE/legal name snapshot.
- `stationAddress`: current CNE address snapshot.
- `candidateSource`: `osm`, `google_places`, or `manual`.
- `candidateName`, `candidateBrand`, `candidateOperator`: external evidence.
- `candidateDistanceMeters`: distance between CNE coordinate and external POI.
- `matchStatus`: `accepted`, `review_nearby_not_accepted`, `no_match`,
  `manual_override`, or `rejected`.
- `acceptedBrand`: reviewed brand to use later.
- `confidence`: `high`, `review`, or `none`.
- `reviewedBy`, `reviewedAt`, `notes`: audit trail.

Admin functions live in `convex/admin.ts`:

- `scanStationBrands`: scans one state/municipality against OSM Overpass.
- `stationBrandAuditOverview`: reads audit rows for admin.
- `reviewStationBrand`: accepts, rejects, or manually overrides a brand.

The admin UI is in `/admin/ingestion`, implemented in
`src/routes/admin.ingestion.tsx`. The pilot is currently hardcoded to Zacatecas
Capital:

- `stateExternalId = "32"`
- `municipalityExternalId = "056"`

## Matching rules

Use conservative distance gates:

- `<= 40m`: accept automatically if a candidate brand/name exists.
- `41-100m`: store as `review_nearby_not_accepted`.
- `> 100m`: store as `no_match`.

Do not widen the automatic threshold without adding stronger evidence. The
Gazpro/Walmart Zacatecas case proves why: OSM has a nearby Pemex around 88m
away, but that is a different station. The correct brand is Gazpro and should
come from legal-name rule or manual review, not nearest-neighbor matching.

For commercial plazas, big-box store lots, highway corridors, and corners with
multiple stations, distance alone is not enough. Keep medium-distance matches as
evidence only.

## OSM behavior observed in Zacatecas

OSM/Overpass found useful POIs, but coverage is incomplete. It can identify some
Pemex matches with high confidence when the POI is within 40m, but it misses
Gazpro at Walmart and other stations.

This is acceptable for a first pass:

1. Use OSM for cheap high-confidence matches.
2. Preserve all ambiguous cases for review.
3. Use manual overrides for known local corrections.
4. Use Google Places only as a second pass for `no_match` and review rows.

## Google Places plan

Google should be a second-pass enrichment source, not the default for every row.
The recommended flow:

1. Run OSM scan by municipality.
2. Accept only `<= 40m` OSM matches.
3. Apply deterministic legal-name rules for obvious brands such as Gazpro,
   Hidrosina, Orsan, Costco Gas, BP, etc.
4. Send remaining `no_match` and `review_nearby_not_accepted` rows to Google
   Places.
5. Store Google evidence in `stationBrandAudits` with
   `candidateSource = "google_places"`.
6. Keep the same conservative acceptance rules unless the Google result has
   stronger address/name agreement.

As of Google's pricing page last updated 2026-06-11:

- Places API Nearby Search Pro: 5,000 free events/month, then 32 USD per 1,000
  events up to 100k.
- Places API Place Details Pro: 5,000 free events/month, then 17 USD per 1,000
  events up to 100k.

Worst-case national run for 13,720 stations:

- Nearby Search only: about `(13,720 - 5,000) / 1000 * 32 = 279 USD`.
- If Place Details Pro is also called for every station: about 148 USD more.

The expected cost should be lower if Google is only used after OSM and
legal-name rules.

## Future station fields

Do not add these until audit quality is good enough:

- `stations.legalName`
- `stations.brandName`
- `stations.displayName`
- `stations.brandSource`
- `stations.brandReviewedAt`

When ready, migrate as follows:

1. Keep current `stations.name` as the CNE/legal value or copy it to
   `legalName`.
2. Populate `brandName` from accepted audit rows.
3. Derive `displayName` for UI from brand plus address/area when useful.
4. Update search indexes to include both legal name and brand/display name.
5. Keep station detail pages showing both the brand and legal name.

## Follow-up tasks

- Add a municipality selector to the admin brand audit UI instead of hardcoding
  Zacatecas.
- Add legal-name brand rules before calling Google.
- Add Google Places action behind an env var such as `GOOGLE_MAPS_API_KEY`.
- Store source-specific fields carefully; review Google's storage and display
  terms before persisting raw place data.
- Add a reviewed-brand projection query for public UI once enough rows are
  audited.
- Add admin filters for `review_nearby_not_accepted`, `no_match`, and
  `manual_override`.
- Add CSV export for audit review.

# Litrito architecture

Litrito uses TanStack Start for the web app and Convex for database, server
functions, actions, and scheduled ingestion. The initial scope intentionally
does not include a separate Hono API or PostgreSQL service.

## Data sources

- Catalogs: `https://api-catalogo.cne.gob.mx/api/utiles/entidadesfederativas`
- Municipalities: `https://api-catalogo.cne.gob.mx/api/utiles/municipios?EntidadFederativaId=XX`
- Station prices by location: `https://api-reportediario.cne.gob.mx/api/EstacionServicio/Petroliferos?entidadId=XX&municipioId=YYY`
- XML price snapshot: `https://publicacionexterna.azurewebsites.net/publicaciones/prices`
- XML station locations: `https://publicacionexterna.azurewebsites.net/publicaciones/places`

The Reporte Diario API is the best source for the filterable list because it
includes permit number, station name, address, product, subproduct, price,
state id, and municipality id. This JSON API is Litrito's primary source of
truth.

The official XML `prices` file only contains `place_id`, fuel type, and price.
It is useful as a heartbeat, audit snapshot, or fallback comparison, but it is
not enough to build Litrito's station search because it does not include permit
number, name, address, state, municipality, or coordinates.

The XML `places` file is optional enrichment. When available, it can add
coordinates through `cre_id`, which appears to match the station permit number.
Litrito must not rely on `place_id` as the station key.

## CNE mini-spec

Use these request rules for the internal CNE client:

- Call municipality prices with `municipioId` padded to three digits, for
  example `014`, while storing ids internally as strings to preserve padding.
- Send conservative server-side headers: `Accept: application/json`,
  `User-Agent: Litrito/1.0`, `Origin: https://www.cne.gob.mx`, and
  `Referer: https://www.cne.gob.mx/`.
- Treat the CNE envelope shape as `{ Success, Errors, Value }`.
- Map `Numero` to `stations.permitNumber`.
- Map `Nombre`, `Direccion`, `EntidadFederativaId`, and `MunicipioId` to the
  station record.
- Map `Producto`, `SubProducto`, and `PrecioVigente` to current and historical
  fuel prices.
- Normalize fuels to `regular`, `premium`, `diesel`, `duba`, or `unknown`.

## Convex model

- `states` and `municipalities`: CNE catalogs for filters.
- `stations`: one document per permit number. Includes optional `placeId`,
  `latitude`, and `longitude` from the CNE places XML.
- `fuelPricesCurrent`: latest known price per station and normalized fuel.
- `fuelPricesHistory`: append-only price history per ingestion run.
- `ingestionRuns`: status, timing, source URL, and counts for every fetch.
- `rawSnapshots`: metadata and sample payloads for official XML snapshots.
- `stationFavorites`: authenticated user favorites. Anonymous favorites live in
  browser `localStorage` and sync to this table after sign-in.

## Ingestion flow

1. Refresh CNE catalogs.
2. Capture `prices` XML as a validation/audit snapshot.
3. Capture `places` XML and patch coordinates onto known stations by permit.
4. Queue one municipality refresh per CNE municipality.
5. Normalize fuels to `regular`, `premium`, `diesel`, `duba`, or `unknown`.
6. Replace current prices for the station/fuel pair and append history rows.

Convex crons are scheduled at 00:15, 00:30, 01:00, and 02:00 UTC, matching
18:15, 18:30, 19:00, and 20:00 America/Mexico_City when the source is on GMT-6.
Failures create `ingestionRuns` records and do not delete the last good current
prices.

On a fresh deployment, the UI can also call `bootstrapNationalRefresh` once when
there are no price ingestion runs and no stations for the selected search. This
queues all CNE municipalities in the background with a 30 minute throttle, so a
new empty database starts filling without waiting for the 18:15 cron.

The current implementation is aligned with the brief's main source decision:
JSON by municipality is primary and XML is secondary. Remaining data hardening:

- Add a dedicated `ingestionErrors` table for per-municipality failures.
- Promote national daily runs from `running/success/failed/skipped` to include
  a `partial_success` summary when some municipalities fail but valid data was
  ingested.
- Add explicit request retries with backoff per municipality.
- Replace the current staggered Convex scheduling with a bounded worker queue if
  we need true concurrency control around five active requests.

## UI flow

The `/` route is the product screen:

- location filters backed by Convex catalogs,
- manual municipality refresh for development and spot checks,
- fuel segmented control,
- station search by name, permit, or address,
- price-sorted station list,
- coordinate map from CNE `places` data when available,
- local favorites for anonymous users and Convex-backed favorites for signed-in
  users.

The current map is dependency-free and projects points into the selected result
bounds. A later production map should use MapLibre or another tile renderer once
we decide on tile provider, marker clustering, and geolocation permissions. The
map is not required for the data MVP; search by state, municipality, station,
fuel, and price should continue working without coordinates.

## Notes from the guides

The frontend follows the guide's route-first and feature-first intent, but this
single-app MVP keeps feature code colocated until boundaries become worth the
extra folders. The Hono guide is retained for future reference if Litrito later
splits into `apps/api` or worker services, but Convex is currently the backend
surface.

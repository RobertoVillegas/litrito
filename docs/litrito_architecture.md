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
state id, and municipality id. The XML `places` file is used to enrich stations
with coordinates through `cre_id`, which matches the permit number.

## Convex model

- `states` and `municipalities`: CNE catalogs for filters.
- `stations`: one document per permit number. Includes optional `placeId`,
  `latitude`, and `longitude` from the CNE places XML.
- `fuelPricesCurrent`: latest known price per station and normalized fuel.
- `fuelPricesHistory`: append-only price history per ingestion run.
- `ingestionRuns`: status, timing, source URL, and counts for every fetch.
- `rawSnapshots`: metadata and sample payloads for official XML snapshots.

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

## UI flow

The `/` route is the product screen:

- location filters backed by Convex catalogs,
- manual municipality refresh for development and spot checks,
- fuel segmented control,
- station search by name, permit, or address,
- price-sorted station list,
- coordinate map from CNE `places` data when available.

The current map is dependency-free and projects points into the selected result
bounds. A later production map should use MapLibre or another tile renderer once
we decide on tile provider, marker clustering, and geolocation permissions.

## Notes from the guides

The frontend follows the guide's route-first and feature-first intent, but this
single-app MVP keeps feature code colocated until boundaries become worth the
extra folders. The Hono guide is retained for future reference if Litrito later
splits into `apps/api` or worker services, but Convex is currently the backend
surface.

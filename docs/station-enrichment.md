# Station enrichment (brand + display name)

Stations come from the **CNE** (the source of truth). The CNE record only gives
the *razón social* (legal/permit-holder name), which users don't recognize on
the forecourt. We enrich stations with a recognizable **brand** and a
human-friendly **display name** from external sources — **without ever
overwriting the CNE data**.

## Non-destructive by design

- The `stations` table (CNE) is never modified by enrichment. `stations.name`
  stays as the CNE razón social.
- Enrichment lives in its own table, **`stationEnrichment`**, keyed by
  `stationPermitNumber`. Each row records full provenance:
  - `source` — `overture` | `foursquare` | `osm` | `legal_name` | `manual`
  - `sourceRelease` — the dataset version (e.g. `overture-2026-05-20.0`)
  - `sourceId` — the source POI id (Overture GERS id) — exactly which POI
  - `sourceName` — the raw name from the source
  - `matchDistanceMeters` — how far the matched POI was from the CNE coordinate
  - `brand`, `displayName`, `enrichedAt`

## Current source: Overture Maps Places

- Release `2026-05-20.0`, theme `places`, category `gas_station`.
- License **CDLA-Permissive-2.0** (open, commercial use OK, storable). Some
  Overture data derives from OpenStreetMap (ODbL) — **attribution required** if
  surfaced publicly: "© OpenStreetMap contributors, © Overture Maps Foundation".
- Coverage measured against our 13,717 geocoded stations (≤80 m match):
  **6,484 matched (47%)**, **4,778 with a recognizable chain brand (35%)**.
  Top brands: Pemex, BP, Oxxo Gas, Repsol, Arco, Shell, Petro-7, Valero, Mobil,
  G500, Hidrosina, Orsan, Rendichicas, Gulf… Many MX stations are independents
  with no chain brand — for those the Overture `displayName` still beats the
  razón social.

## Reproducing the enrichment

1. Extract Mexico gas stations from Overture (free, no key) with DuckDB:
   ```sql
   INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
   COPY (
     SELECT id, names.primary AS name, brand.names.primary AS brand,
            bbox.xmin AS lon, bbox.ymin AS lat
     FROM read_parquet('s3://overturemaps-us-west-2/release/2026-05-20.0/theme=places/type=place/*', hive_partitioning=1)
     WHERE bbox.xmin BETWEEN -118.5 AND -86.5 AND bbox.ymin BETWEEN 14.5 AND 32.7
       AND categories.primary = 'gas_station'
   ) TO 'overture_mx_fuel.csv' (HEADER);
   ```
2. Dump our stations: `bun run dump:stations:csv`.
3. Match + push: `python3 scripts/enrich-overture.py` (matches each CNE station
   to the nearest Overture POI ≤80 m, derives a clean chain brand, and pushes
   batches into `stationEnrichment` via `enrichment:applyEnrichmentBatch`).

Re-running is idempotent (one enrichment row per station, replaced in place).

## Not yet done (next)

- Public projection: show `displayName`/`brand` on the station detail, list, and
  map (CNE legal name kept as secondary), and a **filter by brand**. The data is
  in place; surfacing it is the remaining step.
- Optional later: Foursquare (now portal/Iceberg, not public S3) and a paid
  Google Places tail for stations Overture didn't cover.

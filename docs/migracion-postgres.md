# Migración: Convex self-hosted → PostgreSQL

## Por qué

Estado actual (medido el 31-jul-2026 en el VPS):

- Backend Convex: límite 4 GiB, vive al **99.7%**, 11 restarts desde el 13-jul.
- Dashboard Convex: 384 MiB. Web (Nitro/bun): 768 MiB (OOM-killed → 404).
- Host al 86% de RAM.
- En logs: `TooMuchMemoryCarryOver` y timeouts por hora en UDFs de ingestion,
  y un cron muerto por OCC en `ingestionRuns`.

El shape de litrito es ~90% pipeline de ingestion CNE (ETL diario) + app
pública read-only con mapa. Ese perfil **no usa lo que cobra Convex**
(realtime sync, colaboración). PostgreSQL corre el mismo workload en una
fracción de la memoria y con menos piezas que cuidar.

## Arquitectura destino

| Pieza | Hoy | Destino |
| --- | --- | --- |
| Datos | convex backend (4 GiB) | Postgres 18 + pg_trgm (postgis opcional), `mem_limit: 512m` |
| Dashboard | convex dashboard (384 MiB) | `drizzle-studio` local bajo demanda |
| API | UDFs convex | TanStack Start server functions (ya es el framework del frontend) |
| ORM | — | `drizzle-orm` + `postgres.js` (bun), migraciones con `drizzle-kit` |
| Auth | `@convex-dev/better-auth` | `better-auth` con adapter drizzle/Postgres (misma API) |
| Ingestion | crons convex en el backend | `scripts/ingest/` standalone, container cron bun (512 MiB) |
| Búsqueda | tantivy (`search_station`) | `pg_trgm` + GIN (+ `unaccent` para acentos) |
| Fotos | convex storage | Sólo metadatos; la UI ya no usa ni migra JPEG |

Container de ingestion **separado del web**: la lección del OOM de 768 MiB es
que un pico de ingestion no debe poder tumbar el sitio público.

## Mapa de tablas (18 + auth)

- **Catálogo geo** (`states`, `municipalities`, `locationBounds`): directas.
- **`stations`**: índices: `permitNumber` unique, `(stateExternalId, municipalityExternalId)`, GIN trgm en `name`, btree en `(latitude, longitude)`. `latBucket` se conserva o se reemplaza por postgis si el nearby se pone lento.
- **Precios**: `fuelPricesCurrent` con upsert por `(stationPermitNumber, subproduct)`; `fuelPricesHistory` append-only (particionar por mes si crece).
- **Pipeline**: `ingestionRuns` como cola con `SELECT ... FOR UPDATE SKIP LOCKED` — aquí muere el bug de OCC: el lock por fila reemplaza los reintentos optimistas que agotaban el cron. El XML se transforma en memoria y se descarta; `rawSnapshots` conserva sólo conteos, muestra y trazabilidad, nunca `bytea`.
- **Cachés** (`filterOptionsCache`, `metricsCache`): tablas jsonb con `updatedAt` (suficiente; redis ya existe en el host si hiciera falta).
- **Comunidad/admin** (`stationFavorites`, `stationListings`, `stationPhotos`, `stationEnrichment`, `stationBrandAudits`, `adminAuditEvents`, `userRoles`, `accountDeletions`): directas.
- **Auth**: tablas estándar de better-auth (`user`, `account`, `session`, `verification`) vía drizzle adapter. Migrar usuarios por email; aceptable invalidar sesiones (re-login masivo) para simplificar.

## Fases

0. **Estabilizar hoy** (independiente de la migración): levantar `web` desde
   dokploy UI para quitar el 404; subir temporalmente `mem_limit` del web de
   `768m` a `1.5g` y devolverlo a `768m` al retirar Convex
   en `docker-compose.dokploy.yml` para que no vuelva a caer.
1. **Infra**: servicio Postgres en dokploy con volumen persistente respaldado
   por el backup diario del VPS,
   drizzle-kit configurado.
2. **Schema + import**: schema drizzle de las 18 tablas; export desde convex
   (dashboard o script por API) → `COPY`; validar conteos tabla por tabla.
3. **Reads públicas**: stations nearby/search, prices current/history, filter
   options, metrics → server functions. Mantener las mismas query keys de
   react-query y la UI casi no cambia.
4. **Ingestion standalone**: portar `convex/ingestion.ts` (1767 líneas) a
   `scripts/ingest/`; cola `SKIP LOCKED`; batches por municipio más chicos
   (lotes de ~50, streaming) para matar los timeouts y el memory carry-over;
   horario: 00:15/00:30/01:00/02:00 UTC + resume-stale cada 15 min como loop
   dentro del mismo script.
5. **Auth**: better-auth + drizzle; migrar usuarios; emails ya son externos
   (nodemailer) ✓.
6. **Writes/comunidad**: favorites, listings, photos, enrichment, admin.
7. **Apagar Convex**: quitar `backend` y `dashboard` del compose, borrar
   `convex/` y las deps en un PR final. Se liberan ~4.3 GiB del host.

## Riesgos y notas

- `prices.js:latestRun` (timeout cada hora hoy): como query pg con los índices
  correctos probablemente desaparece; verificar con `EXPLAIN` al migrar.
- Búsqueda trgm vs tantivy: para nombres de estaciones la calidad es
  comparable; activar `unaccent`.
- Geo: si el nearby por radio se degrada, postgis (mismo container, +~50 MiB).
- `matchPlacesBatch` y `applyMunicipalityPrices`: reescribir con lotes
  acotados; son la fuente principal de presión de memoria hoy.

## Estimado de memoria

| | Hoy | Destino |
| --- | --- | --- |
| backend convex | 4 GiB (al 99.7%) | — |
| dashboard | 384 MiB | — |
| web | 768 MiB | 1 GiB |
| postgres | — | 512 MiB |
| cron ingestion | — | 512 MiB |
| **Techo total** | **~5.1 GiB** | **~2 GiB** |

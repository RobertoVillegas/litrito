# Litrito

Aplicación pública de precios de gasolina en México construida con TanStack
Start, React 19, Bun y PostgreSQL 18.

## Desarrollo

```bash
cp .env.example .env.local
docker compose up -d postgres
bun install
bun run db:migrate
bun run dev
```

Comandos principales:

```bash
bun run test
bun run type-check
bun run build
bun run db:generate
bun run ingest:enqueue
```

La aplicación usa módulos hexagonales por dominio bajo `src/features`: los
casos de uso dependen de puertos y PostgreSQL vive en infraestructura.
La ingestion diaria corre en un contenedor Bun separado y reclama municipios
con `FOR UPDATE SKIP LOCKED`.

## Migración de datos heredados

El procedimiento reproducible está en
[`docs/migracion-postgres.md`](docs/migracion-postgres.md). En resumen:

```bash
# Se ejecuta mientras el backend heredado todavía está disponible.
set -a; source .env.local; set +a
bunx convex export --path /private/tmp/litrito-convex.zip

bun run db:migrate
bun run db:import-convex --snapshot=/private/tmp/litrito-convex.zip
bun run db:import-auth --snapshot=/private/tmp/litrito-convex.zip
```

Los importadores validan conteos; el snapshot y cualquier reporte con datos se
mantienen fuera de Git. Los JPEG heredados no se migran porque la UI ya no usa
fotos de estaciones; `station_photos` conserva únicamente sus metadatos.
